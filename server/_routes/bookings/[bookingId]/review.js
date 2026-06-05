import { adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import {
    assertBookingIsFuture,
    buildSlotRecord,
    getSlotId,
    getSlotMinutes,
} from '../../../_lib/bookingPolicy.js'
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

        const booking = { id: bookingSnap.id, ...bookingSnap.data() }
        if (booking.status !== 'pending') {
            throw new ApiError(409, 'Only pending bookings can be reviewed.', 'booking_not_pending')
        }

        assertBookingIsFuture(booking, 'This booking is in the past and can no longer be reviewed.')

        const slotRefs = getSlotMinutes(booking).map((minute) => ({
            minute,
            id: getSlotId(booking, minute),
            ref: adminDb.collection('booking_slots').doc(getSlotId(booking, minute)),
        }))

        if (slotRefs.length === 0 || slotRefs.length > 480) {
            throw new ApiError(409, 'Booking slot data is invalid.', 'invalid_booking_slots')
        }

        for (const slot of slotRefs) {
            const slotSnap = await transaction.get(slot.ref)
            if (status === 'approved') {
                if (!slotSnap.exists || slotSnap.data().booking_id !== booking.id) {
                    throw new ApiError(409, 'Booking slot locks are missing or conflicted.', 'booking_slot_conflict')
                }
            }
        }

        const update = {
            status,
            faculty_id: context.uid,
            faculty_comments: comments,
            updated_at: nowIso(),
        }
        updatedBooking = { ...booking, ...update }
        transaction.update(bookingRef, update)

        for (const slot of slotRefs) {
            if (status === 'approved') {
                transaction.set(slot.ref, buildSlotRecord(updatedBooking, slot.id, slot.minute, 'approved'), { merge: true })
            } else {
                transaction.delete(slot.ref)
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
            profile: { id: studentSnap.id, ...studentSnap.data() },
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
