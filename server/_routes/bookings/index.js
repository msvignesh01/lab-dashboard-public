import crypto from 'node:crypto'
import { adminDb, FieldValue } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import {
    addDaysToDateString,
    buildBookingLockPatch,
    getBookingLockBuckets,
    getBookingLockId,
    MAX_BOOKING_LOCK_BUCKETS,
    toLabDateString,
    validateBookingPayload,
} from '../../_lib/bookingPolicy.js'
import { getLabConfig, assertWithinLabHours } from '../../_lib/labConfig.js'
import { assertNoMaintenanceConflict, getTrainingRecordId } from '../../_lib/availability.js'
import {
    assertBookingApprovalSafety,
    assertBookingLocksAvailable,
    getScheduleGuardRefs,
    transactionGetAll,
} from '../../_lib/schedulePolicy.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { createNotification, notifyFacultyAndAdmins } from '../../_lib/notifications.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { parseTimeToMinute } from '../../../shared/bookingValidation.js'
import { toBookingReviewerProfileSummary } from '../../_lib/userPolicy.js'

const nowIso = () => new Date().toISOString()

const fromDoc = fromFirestoreDocument

const fetchById = async (collectionName, id) => {
    if (!isValidFirestoreId(id)) return null
    const snap = await adminDb.collection(collectionName).doc(id).get()
    return snap.exists ? fromDoc(snap) : null
}

const fetchProfileSummary = async (id) => {
    const profile = await fetchById('profiles', id)
    return toBookingReviewerProfileSummary(profile)
}

const enrichBookings = async (bookings, includeProfiles = false) => {
    return Promise.all(bookings.map(async (booking) => ({
        ...booking,
        machines: await fetchById('machines', booking.machine_id),
        ...(includeProfiles ? { profiles: await fetchProfileSummary(booking.student_id) } : {}),
    })))
}

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'POST'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: req.method === 'POST' ? ['student'] : [],
    })

    if (req.method === 'GET') {
        const isReviewer = ['faculty', 'admin'].includes(context.profile.role)
        const today = toLabDateString()
        const dateFrom = typeof req.query?.date_from === 'string' ? req.query.date_from : today
        const dateTo = typeof req.query?.date_to === 'string' ? req.query.date_to : addDaysToDateString(dateFrom, 30)
        const status = typeof req.query?.status === 'string' ? req.query.status : ''
        const machineId = typeof req.query?.machine_id === 'string' ? req.query.machine_id : ''
        const studentId = typeof req.query?.student_id === 'string' ? req.query.student_id : ''

        let bookingsQuery = adminDb.collection('bookings')
            .where('booking_date', '>=', dateFrom)
            .where('booking_date', '<=', dateTo)
            .orderBy('booking_date', 'asc')
            .limit(200)

        if (!isReviewer) {
            bookingsQuery = adminDb.collection('bookings')
                .where('student_id', '==', context.uid)
                .where('booking_date', '>=', dateFrom)
                .where('booking_date', '<=', dateTo)
                .orderBy('booking_date', 'asc')
                .limit(200)
        }

        const snapshot = await bookingsQuery.get()
        let bookings = snapshot.docs.map(fromDoc)
        if (status) bookings = bookings.filter((booking) => booking.status === status)
        if (machineId) bookings = bookings.filter((booking) => booking.machine_id === machineId)
        if (isReviewer && studentId) bookings = bookings.filter((booking) => booking.student_id === studentId)

        return sendOk(res, await enrichBookings(bookings, isReviewer))
    }

    await assertRateLimit({ uid: context.uid, action: 'booking_create', limit: 20, windowMs: 60_000 })
    const body = await parseJsonBody(req)
    const labConfig = await getLabConfig()
    const sanitized = validateBookingPayload(body, {
        uid: context.uid,
        limits: {
            max_advance_days: labConfig.max_advance_days,
            max_duration_hours: labConfig.max_duration_hours,
        },
    })
    const startMinute = parseTimeToMinute(sanitized.start_time)
    const endMinute = parseTimeToMinute(sanitized.end_time)
    const durationHours = (endMinute - startMinute) / 60

    if (durationHours > labConfig.max_duration_hours) {
        throw new ApiError(400, `Booking duration cannot exceed ${labConfig.max_duration_hours} hours.`, 'booking_too_long')
    }
    if (sanitized.booking_date > addDaysToDateString(toLabDateString(), labConfig.max_advance_days)) {
        throw new ApiError(400, `Cannot book more than ${labConfig.max_advance_days} days in advance.`, 'booking_too_far_ahead')
    }
    assertWithinLabHours(sanitized, labConfig)
    await assertNoMaintenanceConflict(sanitized)

    const bookingId = crypto.randomUUID()
    const timestamp = nowIso()
    const booking = {
        id: bookingId,
        ...sanitized,
        faculty_id: null,
        faculty_comments: '',
        created_at: timestamp,
        updated_at: timestamp,
    }

    const lockBuckets = getBookingLockBuckets(booking)
    if (lockBuckets.length === 0 || lockBuckets.length > MAX_BOOKING_LOCK_BUCKETS) {
        throw new ApiError(400, 'Invalid booking duration.', 'invalid_booking_duration')
    }

    await adminDb.runTransaction(async (transaction) => {
        const machineRef = adminDb.collection('machines').doc(booking.machine_id)
        const profileRef = adminDb.collection('profiles').doc(booking.student_id)
        const guardRefs = getScheduleGuardRefs(adminDb, { machineId: booking.machine_id })
        const lockRefs = lockBuckets.map((bucketMinute) => ({
            bucketMinute,
            ref: adminDb.collection('booking_slots').doc(getBookingLockId(booking, bucketMinute)),
        }))
        const snapshots = await transactionGetAll(transaction, [
            ...guardRefs,
            machineRef,
            profileRef,
            ...lockRefs.map((lock) => lock.ref),
        ])
        const machineSnap = snapshots[guardRefs.length]
        const profileSnap = snapshots[guardRefs.length + 1]
        const lockSnapshots = snapshots.slice(guardRefs.length + 2)

        if (!machineSnap.exists) {
            throw new ApiError(404, 'Selected machine was not found.', 'machine_not_found')
        }

        const machine = fromFirestoreDocument(machineSnap)
        const studentProfile = profileSnap.exists ? fromFirestoreDocument(profileSnap) : null
        let trainingRecord = null
        if (machine.requires_training === true) {
            const trainingSnap = await transaction.get(
                adminDb.collection('training_records').doc(getTrainingRecordId(booking.student_id, booking.machine_id)),
            )
            trainingRecord = trainingSnap.exists ? fromFirestoreDocument(trainingSnap) : null
        }

        const currentLabConfig = await getLabConfig(transaction)
        const maintenanceSnap = await transaction.get(
            adminDb.collection('maintenance_windows').where('status', '==', 'active'),
        )
        const bookingsSnap = await transaction.get(
            adminDb.collection('bookings').where('booking_date', '==', booking.booking_date),
        )
        assertBookingApprovalSafety({
            booking,
            machine,
            studentProfile,
            trainingRecord,
            labConfig: currentLabConfig,
            maintenanceWindows: maintenanceSnap.docs.map(fromDoc),
            bookings: bookingsSnap.docs.map(fromDoc),
        })
        assertBookingLocksAvailable({ booking, lockSnapshots })

        const bookingRef = adminDb.collection('bookings').doc(bookingId)
        transaction.create(bookingRef, booking)

        for (const lock of lockRefs) {
            transaction.set(lock.ref, buildBookingLockPatch(booking, lock.bucketMinute), { merge: true })
        }
        for (const guardRef of guardRefs) {
            transaction.set(guardRef, {
                version: FieldValue.increment(1),
                machine_id: guardRef.id === 'global' ? null : booking.machine_id,
                updated_at: timestamp,
                updated_by: context.uid,
            }, { merge: true })
        }

        writeAuditLog({
            transaction,
            actor: context,
            action: 'booking.created',
            entity_type: 'booking',
            entity_id: bookingId,
            metadata: {
                machine_id: booking.machine_id,
                booking_date: booking.booking_date,
                start_time: booking.start_time,
                end_time: booking.end_time,
            },
        })
    })

    await createNotification({
        profile: context.profile,
        type: 'booking_created',
        title: 'Booking request submitted',
        message: 'Your booking request was submitted and is waiting for review.',
        entity: { type: 'booking', id: bookingId },
        email: true,
    }).catch(() => {})

    await notifyFacultyAndAdmins({
        type: 'booking_pending',
        title: 'New booking request',
        message: 'A student submitted a booking request that needs review.',
        entity: { type: 'booking', id: bookingId },
    }).catch(() => {})

    return sendOk(res, booking, 201)
})
