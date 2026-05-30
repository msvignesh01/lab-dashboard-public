import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import {
    assertBookingIsFuture,
    getSlotId,
    getSlotMinutes,
    isActiveBookingStatus,
} from '../../_lib/bookingPolicy.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['student'],
    })
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

        const booking = { id: bookingSnap.id, ...bookingSnap.data() }

        if (booking.student_id !== context.uid) {
            throw new ApiError(403, 'You can only cancel your own bookings.', 'booking_not_owned')
        }

        if (!isActiveBookingStatus(booking.status)) {
            throw new ApiError(409, 'Only pending or approved bookings can be cancelled.', 'booking_not_cancellable')
        }

        assertBookingIsFuture(booking)

        const update = {
            status: 'cancelled',
            updated_at: nowIso(),
        }
        updatedBooking = { ...booking, ...update }
        transaction.update(bookingRef, update)

        for (const minute of getSlotMinutes(booking)) {
            transaction.delete(adminDb.collection('booking_slots').doc(getSlotId(booking, minute)))
        }
    })

    return sendOk(res, updatedBooking)
})
