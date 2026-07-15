import { adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import { runAuditedTransaction } from '../../../_lib/audit.js'
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
    const timestamp = new Date().toISOString()
    const update = {
        status: 'suspended',
        suspended_at: timestamp,
        faculty_rejection_reason: reason,
        updated_at: timestamp,
    }

    const updated = await runAuditedTransaction({
        actor: context,
        mutate: async (transaction) => {
            const profileSnap = await transaction.get(profileRef)
            if (!profileSnap.exists) {
                throw new ApiError(404, 'Profile not found.', 'profile_not_found')
            }

            const profile = fromFirestoreDocument(profileSnap)
            if (profile.requested_role !== 'faculty' || profile.status !== 'pending_approval') {
                throw new ApiError(409, 'This account is not pending faculty approval.', 'not_pending_faculty')
            }

            const nextProfile = { ...profile, ...update }
            transaction.update(profileRef, update)
            return {
                result: nextProfile,
                audit: {
                    action: 'faculty.rejected',
                    entity_type: 'profile',
                    entity_id: userId,
                    metadata: { reason },
                },
            }
        },
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
