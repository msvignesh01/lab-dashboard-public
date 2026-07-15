import { adminDb, FieldValue } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import {
    assertBookingIsFuture,
    buildBookingLockReleasePatch,
    getBookingLockBuckets,
    getBookingLockId,
    MAX_DAILY_BOOKING_LOCK_BUCKETS,
    isActiveBookingStatus,
} from '../../../_lib/bookingPolicy.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { createNotification, notifyFacultyAndAdmins } from '../../../_lib/notifications.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['student'],
    })
    await assertRateLimit({ uid: context.uid, action: 'booking_cancel', limit: 30, windowMs: 60_000 })
    const bookingId = getRouteParam(req, 'bookingId')

    if (!isValidFirestoreId(bookingId)) {
        throw new ApiError(400, 'Invalid booking ID.', 'invalid_booking_id')
    }

    let updatedBooking = null

    await adminDb.runTransaction(async (transaction) => {
        const bookingRef = adminDb.collection('bookings').doc(bookingId)
        const bookingSnap = await transaction.get(bookingRef)

        if (!bookingSnap.exists) {
            throw new ApiError(404, 'Booking not found.', 'booking_not_found')
        }

        const booking = fromFirestoreDocument(bookingSnap)

        if (booking.student_id !== context.uid) {
            throw new ApiError(403, 'You can only cancel your own bookings.', 'booking_not_owned')
        }

        if (!isActiveBookingStatus(booking.status)) {
            throw new ApiError(409, 'Only pending or approved bookings can be cancelled.', 'booking_not_cancellable')
        }

        assertBookingIsFuture(booking)

        const lockBuckets = getBookingLockBuckets(booking)
        if (lockBuckets.length === 0 || lockBuckets.length > MAX_DAILY_BOOKING_LOCK_BUCKETS) {
            throw new ApiError(409, 'Booking lock data is invalid.', 'invalid_booking_slots')
        }

        const update = {
            status: 'cancelled',
            updated_at: nowIso(),
        }
        updatedBooking = { ...booking, ...update }
        transaction.update(bookingRef, update)

        for (const bucketMinute of lockBuckets) {
            const lockRef = adminDb.collection('booking_slots').doc(getBookingLockId(booking, bucketMinute))
            transaction.set(
                lockRef,
                buildBookingLockReleasePatch(booking, bucketMinute, FieldValue.delete(), update.updated_at),
                { merge: true },
            )
        }

        writeAuditLog({
            transaction,
            actor: context,
            action: 'booking.cancelled',
            entity_type: 'booking',
            entity_id: bookingId,
            metadata: {
                machine_id: booking.machine_id,
                booking_date: booking.booking_date,
                status: booking.status,
            },
        })
    })

    await createNotification({
        profile: context.profile,
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: 'Your booking was cancelled and the slot was released.',
        entity: { type: 'booking', id: bookingId },
        email: true,
    }).catch(() => {})
    await notifyFacultyAndAdmins({
        type: 'booking_cancelled',
        title: 'Booking cancelled',
        message: 'A student cancelled a booking.',
        entity: { type: 'booking', id: bookingId },
    }).catch(() => {})

    return sendOk(res, updatedBooking)
})
