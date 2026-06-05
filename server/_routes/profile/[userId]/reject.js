import { adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { createNotification } from '../../../_lib/notifications.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'faculty_reject', limit: 30, windowMs: 60_000 })

    const userId = getRouteParam(req, 'userId')
    if (!isValidFirestoreId(userId)) {
        throw new ApiError(400, 'Invalid user ID.', 'invalid_user_id')
    }

    const body = await parseJsonBody(req)
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : ''
    if (!reason) {
        throw new ApiError(400, 'A rejection reason is required.', 'missing_rejection_reason')
    }

    const profileRef = adminDb.collection('profiles').doc(userId)
    const profileSnap = await profileRef.get()
    if (!profileSnap.exists) {
        throw new ApiError(404, 'Profile not found.', 'profile_not_found')
    }

    const profile = { id: profileSnap.id, ...profileSnap.data() }
    if (profile.requested_role !== 'faculty' || profile.status !== 'pending_approval') {
        throw new ApiError(409, 'This account is not pending faculty approval.', 'not_pending_faculty')
    }

    const update = {
        status: 'suspended',
        suspended_at: new Date().toISOString(),
        faculty_rejection_reason: reason,
        updated_at: new Date().toISOString(),
    }

    await profileRef.set(update, { merge: true })
    const updated = { ...profile, ...update }
    await writeAuditLog({
        actor: context,
        action: 'faculty.rejected',
        entity_type: 'profile',
        entity_id: userId,
        metadata: { reason },
    })
    await createNotification({
        profile: updated,
        type: 'faculty_request_rejected',
        title: 'Faculty access request rejected',
        message: reason,
        entity: { type: 'profile', id: userId },
        email: true,
    }).catch(() => {})

    return sendOk(res, updated)
})
