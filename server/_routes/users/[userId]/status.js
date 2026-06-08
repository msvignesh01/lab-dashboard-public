import { adminAuth, adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'
import { createNotification } from '../../../_lib/notifications.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'user_status_update', limit: 30, windowMs: 60_000 })

    const userId = getRouteParam(req, 'userId')
    if (!isValidFirestoreId(userId)) throw new ApiError(400, 'Invalid user ID.', 'invalid_user_id')
    if (userId === context.uid) throw new ApiError(409, 'You cannot change your own access status.', 'self_status_change')

    const body = await parseJsonBody(req)
    const status = body.status === 'suspended' ? 'suspended' : 'active'
    const profileRef = adminDb.collection('profiles').doc(userId)
    const profileSnap = await profileRef.get()
    if (!profileSnap.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')

    const update = {
        status,
        suspended_at: status === 'suspended' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
    }

    await profileRef.set(update, { merge: true })
    await adminAuth.updateUser(userId, { disabled: status === 'suspended' }).catch(() => {})

    const updatedProfile = { id: profileSnap.id, ...profileSnap.data(), ...update }
    await writeAuditLog({
        actor: context,
        action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
        entity_type: 'profile',
        entity_id: userId,
        metadata: { status },
    })
    await createNotification({
        profile: updatedProfile,
        type: status === 'suspended' ? 'account_suspended' : 'account_reactivated',
        title: status === 'suspended' ? 'Account suspended' : 'Account reactivated',
        message: status === 'suspended'
            ? 'Your lab dashboard account has been suspended. Contact the lab administrator for help.'
            : 'Your lab dashboard account has been reactivated.',
        entity: { type: 'profile', id: userId },
        email: true,
    }).catch(() => {})

    return sendOk(res, updatedProfile)
})
