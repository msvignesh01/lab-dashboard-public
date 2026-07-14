import { adminDb, FieldValue } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import {
    assertBookingIsFuture,
    buildBookingLockPatch,
    buildBookingLockReleasePatch,
    getBookingLockBuckets,
    getBookingLockId,
    MAX_BOOKING_LOCK_BUCKETS,
    MAX_DAILY_BOOKING_LOCK_BUCKETS,
} from '../../../_lib/bookingPolicy.js'
import { getLabConfig } from '../../../_lib/labConfig.js'
import { getTrainingRecordId } from '../../../_lib/availability.js'
import {
    assertBookingApprovalSafety,
    assertBookingLocksAvailable,
    getScheduleGuardRefs,
    transactionGetAll,
} from '../../../_lib/schedulePolicy.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { createNotification } from '../../../_lib/notifications.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'booking_review', limit: 60, windowMs: 60_000 })
    const bookingId = getRouteParam(req, 'bookingId')
    const body = await parseJsonBody(req)

    if (!isValidFirestoreId(bookingId)) {
        throw new ApiError(400, 'Invalid booking ID.', 'invalid_booking_id')
    }

    const status = typeof body.status === 'string' ? body.status.trim() : ''
    if (!['approved', 'rejected'].includes(status)) {
        throw new ApiError(400, 'Invalid review status.', 'invalid_review_status')
    }

    const comments = typeof body.comments === 'string' ? body.comments.trim().slice(0, 1000) : ''
    if (status === 'rejected' && !comments) {
        throw new ApiError(400, 'A rejection reason is required.', 'missing_rejection_reason')
    }

    let updatedBooking = null

    await adminDb.runTransaction(async (transaction) => {
        const bookingRef = adminDb.collection('bookings').doc(bookingId)
        const bookingSnap = await transaction.get(bookingRef)

        if (!bookingSnap.exists) {
            throw new ApiError(404, 'Booking not found.', 'booking_not_found')
        }

        const booking = fromFirestoreDocument(bookingSnap)
        if (booking.status !== 'pending') {
            throw new ApiError(409, 'Only pending bookings can be reviewed.', 'booking_not_pending')
        }

        assertBookingIsFuture(booking, 'This booking is in the past and can no longer be reviewed.')

        const lockBuckets = getBookingLockBuckets(booking)
        const lockRefs = lockBuckets.map((bucketMinute) => ({
            bucketMinute,
            ref: adminDb.collection('booking_slots').doc(getBookingLockId(booking, bucketMinute)),
        }))

        if (
            lockRefs.length === 0
            || lockRefs.length > MAX_DAILY_BOOKING_LOCK_BUCKETS
            || (status === 'approved' && lockRefs.length > MAX_BOOKING_LOCK_BUCKETS)
        ) {
            throw new ApiError(409, 'Booking slot data is invalid.', 'invalid_booking_slots')
        }

        const update = {
            status,
            faculty_id: context.uid,
            faculty_comments: comments,
            updated_at: nowIso(),
        }
        updatedBooking = { ...booking, ...update }

        if (status === 'approved') {
            const machineRef = adminDb.collection('machines').doc(booking.machine_id)
            const profileRef = adminDb.collection('profiles').doc(booking.student_id)
            const guardRefs = getScheduleGuardRefs(adminDb, { machineId: booking.machine_id })
            const snapshots = await transactionGetAll(transaction, [
                ...guardRefs,
                machineRef,
                profileRef,
                ...lockRefs.map((lock) => lock.ref),
            ])
            const machineSnap = snapshots[guardRefs.length]
            const profileSnap = snapshots[guardRefs.length + 1]
            const lockSnapshots = snapshots.slice(guardRefs.length + 2)
            const machine = machineSnap.exists ? fromFirestoreDocument(machineSnap) : null
            const studentProfile = profileSnap.exists ? fromFirestoreDocument(profileSnap) : null
            let trainingRecord = null
            if (machine?.requires_training === true) {
                const trainingSnap = await transaction.get(
                    adminDb.collection('training_records').doc(getTrainingRecordId(booking.student_id, booking.machine_id)),
                )
                trainingRecord = trainingSnap.exists ? fromFirestoreDocument(trainingSnap) : null
            }

            const labConfig = await getLabConfig(transaction)
            const maintenanceSnap = await transaction.get(
                adminDb.collection('maintenance_windows').where('status', '==', 'active'),
            )
            const bookingsSnap = await transaction.get(
                adminDb.collection('bookings').where('booking_date', '==', booking.booking_date),
            )
            const fromDoc = fromFirestoreDocument
            assertBookingApprovalSafety({
                booking,
                machine,
                studentProfile,
                trainingRecord,
                labConfig,
                maintenanceWindows: maintenanceSnap.docs.map(fromDoc),
                bookings: bookingsSnap.docs.map(fromDoc),
            })
            assertBookingLocksAvailable({ booking, lockSnapshots })

            transaction.update(bookingRef, update)
            for (const lock of lockRefs) {
                transaction.set(
                    lock.ref,
                    buildBookingLockPatch(updatedBooking, lock.bucketMinute, 'approved'),
                    { merge: true },
                )
            }
            for (const guardRef of guardRefs) {
                transaction.set(guardRef, {
                    version: FieldValue.increment(1),
                    machine_id: guardRef.id === 'global' ? null : booking.machine_id,
                    updated_at: update.updated_at,
                    updated_by: context.uid,
                }, { merge: true })
            }
        } else {
            // Rejection is a write-only release path: it deliberately performs no
            // lock-document reads and therefore cannot time out on legacy duration.
            transaction.update(bookingRef, update)
            for (const lock of lockRefs) {
                transaction.set(
                    lock.ref,
                    buildBookingLockReleasePatch(
                        booking,
                        lock.bucketMinute,
                        FieldValue.delete(),
                        update.updated_at,
                    ),
                    { merge: true },
                )
            }
        }

        writeAuditLog({
            transaction,
            actor: context,
            action: status === 'approved' ? 'booking.approved' : 'booking.rejected',
            entity_type: 'booking',
            entity_id: bookingId,
            metadata: {
                status,
                machine_id: booking.machine_id,
                student_id: booking.student_id,
            },
        })
    })

    const studentSnap = await adminDb.collection('profiles').doc(updatedBooking.student_id).get()
    if (studentSnap.exists) {
        await createNotification({
            profile: fromFirestoreDocument(studentSnap),
            type: status === 'approved' ? 'booking_approved' : 'booking_rejected',
            title: status === 'approved' ? 'Booking approved' : 'Booking rejected',
            message: status === 'approved'
                ? 'Your booking request was approved.'
                : comments || 'Your booking request was rejected.',
            entity: { type: 'booking', id: bookingId },
            email: true,
        }).catch(() => {})
    }

    return sendOk(res, updatedBooking)
})
