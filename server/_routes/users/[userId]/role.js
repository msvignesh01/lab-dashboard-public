import { adminAuth, adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'
import { createNotification } from '../../../_lib/notifications.js'
import {
    assertRoleMutationAllowed,
    assertRoleTargetIdentity,
    parseUserRole,
} from '../../../_lib/userPolicy.js'

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

    const body = await parseJsonBody(req)
    const role = parseUserRole(body.role)

    let targetAuthUser
    try {
        targetAuthUser = await adminAuth.getUser(userId)
    } catch (error) {
        if (error?.code === 'auth/user-not-found') {
            throw new ApiError(409, 'The target Firebase Auth identity does not exist.', 'target_auth_user_not_found')
        }
        throw new ApiError(503, 'The target Firebase Auth identity could not be verified.', 'target_auth_lookup_failed')
    }

    const profileRef = adminDb.collection('profiles').doc(userId)
    let updatedProfile = null
    await adminDb.runTransaction(async (transaction) => {
        const profileSnap = await transaction.get(profileRef)
        if (!profileSnap.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')

        const profile = fromFirestoreDocument(profileSnap)
        let activeAdminCount = Number.POSITIVE_INFINITY
        if (profile.role === 'admin' && profile.status === 'active' && role !== 'admin') {
            const adminsSnap = await transaction.get(
                adminDb.collection('profiles').where('role', '==', 'admin'),
            )
            activeAdminCount = adminsSnap.docs.filter((doc) => doc.data().status === 'active').length
        }
        assertRoleMutationAllowed({
            actorUid: context.uid,
            targetUid: userId,
            profile,
            nextRole: role,
            activeAdminCount,
        })
        assertRoleTargetIdentity({ authUser: targetAuthUser, profile, nextRole: role })

        const timestamp = new Date().toISOString()
        const update = {
            role,
            requested_role: role,
            role_updated_by: context.uid,
            role_updated_at: timestamp,
            updated_at: timestamp,
        }
        updatedProfile = { ...profile, ...update }
        transaction.set(profileRef, update, { merge: true })
        writeAuditLog({
            transaction,
            actor: context,
            action: 'user.role_updated',
            entity_type: 'profile',
            entity_id: userId,
            metadata: { previous_role: profile.role, role, status: profile.status },
        })
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
