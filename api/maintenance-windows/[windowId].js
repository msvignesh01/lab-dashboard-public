import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../_lib/http.js'
import { isValidFirestoreId } from '../_lib/ids.js'
import { writeAuditLog } from '../_lib/audit.js'
import { assertRateLimit } from '../_lib/rateLimit.js'

export default handleApi(async (req, res) => {
    assertMethod(req, ['PATCH', 'DELETE'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'maintenance_update', limit: 30, windowMs: 60_000 })

    const windowId = getRouteParam(req, 'windowId')
    if (!isValidFirestoreId(windowId)) {
        throw new ApiError(400, 'Invalid maintenance ID.', 'invalid_maintenance_id')
    }

    const ref = adminDb.collection('maintenance_windows').doc(windowId)
    const snap = await ref.get()
    if (!snap.exists) {
        throw new ApiError(404, 'Maintenance window not found.', 'maintenance_not_found')
    }

    const body = req.method === 'PATCH' ? await parseJsonBody(req) : {}
    const update = req.method === 'DELETE'
        ? { status: 'cancelled', updated_at: new Date().toISOString() }
        : {
            status: body.status === 'cancelled' ? 'cancelled' : 'active',
            reason: typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 300) : snap.data().reason,
            updated_at: new Date().toISOString(),
        }

    await ref.set(update, { merge: true })
    const updated = { id: snap.id, ...snap.data(), ...update }

    await writeAuditLog({
        actor: context,
        action: req.method === 'DELETE' ? 'maintenance.cancelled' : 'maintenance.updated',
        entity_type: 'maintenance_window',
        entity_id: windowId,
        metadata: update,
    })

    return sendOk(res, updated)
})
