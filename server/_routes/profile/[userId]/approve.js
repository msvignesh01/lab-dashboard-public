import { adminAuth, adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import { runAuditedTransaction } from '../../../_lib/audit.js'
import { createNotification } from '../../../_lib/notifications.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'
import { assertRoleTargetIdentity } from '../../../_lib/userPolicy.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'PATCH')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'faculty_approve', limit: 30, windowMs: 60_000 })

    const userId = getRouteParam(req, 'userId')
    if (!isValidFirestoreId(userId)) {
        throw new ApiError(400, 'Invalid user ID.', 'invalid_user_id')
    }

    const profileRef = adminDb.collection('profiles').doc(userId)
    let authUser
    try {
        authUser = await adminAuth.getUser(userId)
    } catch (error) {
        if (error?.code === 'auth/user-not-found') {
            throw new ApiError(404, 'Firebase Auth user not found.', 'auth_user_not_found')
        }
        throw new ApiError(503, 'The faculty identity could not be verified.', 'auth_lookup_failed')
    }

    if (authUser.emailVerified !== true) {
        throw new ApiError(409, 'Faculty account must verify email before approval.', 'email_not_verified')
    }

    const now = nowIso()
    const updatedProfile = await runAuditedTransaction({
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
            assertRoleTargetIdentity({ authUser, profile, nextRole: 'faculty' })

            const update = {
                role: 'faculty',
                status: 'active',
                approved_by: context.uid,
                approved_at: now,
                suspended_at: null,
                email_verified_at: profile.email_verified_at || now,
                updated_at: now,
            }
            const updated = { ...profile, ...update }
            transaction.update(profileRef, update)
            return {
                result: updated,
                audit: {
                    action: 'faculty.approved',
                    entity_type: 'profile',
                    entity_id: userId,
                    metadata: { role: 'faculty' },
                },
            }
        },
    })
    await createNotification({
        profile: updatedProfile,
        type: 'faculty_request_approved',
        title: 'Faculty access approved',
        message: 'Your faculty access request was approved. You can now review bookings and manage lab machines.',
        entity: { type: 'profile', id: userId },
        email: true,
    }).catch(() => {})

    return sendOk(res, updatedProfile)
})
