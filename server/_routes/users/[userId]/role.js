import { adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'
import { createNotification } from '../../../_lib/notifications.js'

const VALID_ROLES = new Set(['student', 'faculty', 'admin'])

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'user_role_update', limit: 20, windowMs: 60_000 })

    const userId = getRouteParam(req, 'userId')
    if (!isValidFirestoreId(userId)) throw new ApiError(400, 'Invalid user ID.', 'invalid_user_id')
    if (userId === context.uid) throw new ApiError(409, 'You cannot change your own role.', 'self_role_change')

    const body = await parseJsonBody(req)
    const role = typeof body.role === 'string' ? body.role.trim() : ''
    if (!VALID_ROLES.has(role)) throw new ApiError(400, 'Invalid role.', 'invalid_role')

    const profileRef = adminDb.collection('profiles').doc(userId)
    const profileSnap = await profileRef.get()
    if (!profileSnap.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')

    const update = {
        role,
        requested_role: role,
        status: 'active',
        approved_by: context.uid,
        approved_at: new Date().toISOString(),
        suspended_at: null,
        updated_at: new Date().toISOString(),
    }

    await profileRef.set(update, { merge: true })
    const updatedProfile = { id: profileSnap.id, ...profileSnap.data(), ...update }
    await writeAuditLog({
        actor: context,
        action: 'user.role_updated',
        entity_type: 'profile',
        entity_id: userId,
        metadata: { role },
    })
    await createNotification({
        profile: updatedProfile,
        type: 'role_updated',
        title: 'Account role updated',
        message: `Your lab dashboard role is now ${role}.`,
        entity: { type: 'profile', id: userId },
        email: true,
    }).catch(() => {})

    return sendOk(res, updatedProfile)
})
