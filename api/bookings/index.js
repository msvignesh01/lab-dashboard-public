import crypto from 'node:crypto'
import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../_lib/http.js'
import {
    buildSlotRecord,
    getSlotId,
    getSlotMinutes,
    validateBookingPayload,
} from '../_lib/bookingPolicy.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'POST')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['student'],
    })
    const body = await parseJsonBody(req)
    const sanitized = validateBookingPayload(body, { uid: context.uid })

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
    })

    return sendOk(res, booking, 201)
})
