import crypto from 'node:crypto'
import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import {
    buildSlotRecord,
    addDaysToDateString,
    getSlotId,
    getSlotMinutes,
    toLabDateString,
    validateBookingPayload,
} from '../../_lib/bookingPolicy.js'
import { getLabConfig, assertWithinLabHours } from '../../_lib/labConfig.js'
import { assertNoMaintenanceConflict } from '../../_lib/availability.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { createNotification, notifyFacultyAndAdmins } from '../../_lib/notifications.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { parseTimeToMinute } from '../../../src/lib/bookingValidation.js'

const nowIso = () => new Date().toISOString()

const fromDoc = (doc) => ({ id: doc.id, ...doc.data() })

const fetchById = async (collectionName, id) => {
    if (!isValidFirestoreId(id)) return null
    const snap = await adminDb.collection(collectionName).doc(id).get()
    return snap.exists ? fromDoc(snap) : null
}

const enrichBookings = async (bookings, includeProfiles = false) => {
    return Promise.all(bookings.map(async (booking) => ({
        ...booking,
        machines: await fetchById('machines', booking.machine_id),
        ...(includeProfiles ? { profiles: await fetchById('profiles', booking.student_id) } : {}),
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

    const slotMinutes = getSlotMinutes(booking)
    if (slotMinutes.length === 0 || slotMinutes.length > 480) {
        throw new ApiError(400, 'Invalid booking duration.', 'invalid_booking_duration')
    }

    await adminDb.runTransaction(async (transaction) => {
        const machineRef = adminDb.collection('machines').doc(booking.machine_id)
        const machineSnap = await transaction.get(machineRef)

        if (!machineSnap.exists) {
            throw new ApiError(404, 'Selected machine was not found.', 'machine_not_found')
        }

        if (machineSnap.data().is_active !== true) {
            throw new ApiError(409, 'Selected machine is not available for booking.', 'machine_unavailable')
        }

        const slotRefs = slotMinutes.map((minute) => ({
            minute,
            id: getSlotId(booking, minute),
            ref: adminDb.collection('booking_slots').doc(getSlotId(booking, minute)),
        }))

        for (const slot of slotRefs) {
            const slotSnap = await transaction.get(slot.ref)
            if (slotSnap.exists && ['pending', 'approved'].includes(slotSnap.data().status)) {
                throw new ApiError(409, 'This booking conflicts with an existing booking.', 'booking_conflict')
            }
        }

        const bookingRef = adminDb.collection('bookings').doc(bookingId)
        transaction.create(bookingRef, booking)

        for (const slot of slotRefs) {
            transaction.create(slot.ref, buildSlotRecord(booking, slot.id, slot.minute))
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
