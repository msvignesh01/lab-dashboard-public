import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../_lib/http.js'
import { isValidFirestoreId } from '../_lib/ids.js'
import { sanitizeMachinePayload } from '../_lib/machinePolicy.js'
import { writeAuditLog } from '../_lib/audit.js'
import { assertRateLimit } from '../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, ['PATCH', 'DELETE'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })
    await assertRateLimit({ uid: context.uid, action: `machine_${req.method.toLowerCase()}`, limit: 40, windowMs: 60_000 })

    const machineId = getRouteParam(req, 'machineId')
    if (!isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Invalid machine ID.', 'invalid_machine_id')
    }

    const machineRef = adminDb.collection('machines').doc(machineId)
    const machineSnap = await machineRef.get()
    if (!machineSnap.exists) {
        throw new ApiError(404, 'Machine not found.', 'machine_not_found')
    }

    if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const update = {
            ...sanitizeMachinePayload(body, { partial: true }),
            updated_at: nowIso(),
        }

        await machineRef.update(update)
        const updatedSnap = await machineRef.get()
        await writeAuditLog({
            actor: context,
            action: 'machine.updated',
            entity_type: 'machine',
            entity_id: machineId,
            metadata: { fields: Object.keys(update) },
        })
        return sendOk(res, { id: updatedSnap.id, ...updatedSnap.data() })
    }

    const historicalBookings = await adminDb
        .collection('bookings')
        .where('machine_id', '==', machineId)
        .limit(1)
        .get()

    if (!historicalBookings.empty) {
        const update = {
            is_active: false,
            updated_at: nowIso(),
        }
        await machineRef.update(update)
        const updatedSnap = await machineRef.get()
        await writeAuditLog({
            actor: context,
            action: 'machine.deactivated',
            entity_type: 'machine',
            entity_id: machineId,
            metadata: { historical_bookings: true },
        })
        return sendOk(res, {
            deleted: false,
            machine: { id: updatedSnap.id, ...updatedSnap.data() },
            message: 'Machine has historical bookings and was deactivated instead of deleted.',
        })
    }

    await machineRef.delete()
    await writeAuditLog({
        actor: context,
        action: 'machine.deleted',
        entity_type: 'machine',
        entity_id: machineId,
        metadata: { historical_bookings: false },
    })
    return sendOk(res, { deleted: true, id: machineId })
})
