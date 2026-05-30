import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })

    const userId = getRouteParam(req, 'userId')
    if (!isValidFirestoreId(userId)) {
        throw new ApiError(400, 'Invalid user ID.', 'invalid_user_id')
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
        role: 'faculty',
        status: 'active',
        approved_by: context.uid,
        approved_at: nowIso(),
        suspended_at: null,
        updated_at: nowIso(),
    }

    await profileRef.update(update)
    return sendOk(res, { ...profile, ...update })
})
