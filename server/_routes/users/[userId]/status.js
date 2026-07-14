import crypto from 'node:crypto'
import { adminAuth, adminDb } from '../../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../../_lib/http.js'
import { isValidFirestoreId } from '../../../_lib/ids.js'
import { fromFirestoreDocument } from '../../../_lib/firestoreData.js'
import { writeAuditLog } from '../../../_lib/audit.js'
import { assertRateLimit } from '../../../_lib/rateLimit.js'
import { createNotification } from '../../../_lib/notifications.js'
import {
    assertStatusMutationAllowed,
    buildStatusSyncAuditMetadata,
    isPendingAuthSyncRecoverable,
    parseUserStatus,
    synchronizeUserStatusChange,
} from '../../../_lib/userPolicy.js'

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

    const body = await parseJsonBody(req)
    const status = parseUserStatus(body.status)
    const profileRef = adminDb.collection('profiles').doc(userId)
    const operationId = crypto.randomUUID()
    let updatedProfile = null
    let previousStatus = null

    const stageChange = async ({ suspendProfile }) => {
        await adminDb.runTransaction(async (transaction) => {
            const profileSnap = await transaction.get(profileRef)
            if (!profileSnap.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')

            const profile = fromFirestoreDocument(profileSnap)
            previousStatus = profile.status
            const nowMs = Date.now()
            const recoveringStaleSync = profile.auth_sync_status === 'pending'
                && profile.auth_sync_target === status
                && isPendingAuthSyncRecoverable(profile, nowMs)
            let activeAdminCount = Number.POSITIVE_INFINITY
            if (profile.role === 'admin' && profile.status === 'active' && status === 'suspended') {
                const adminsSnap = await transaction.get(
                    adminDb.collection('profiles').where('role', '==', 'admin'),
                )
                activeAdminCount = adminsSnap.docs.filter((doc) => doc.data().status === 'active').length
            }
            assertStatusMutationAllowed({
                actorUid: context.uid,
                targetUid: userId,
                profile,
                nextStatus: status,
                activeAdminCount,
                nowMs,
            })

            const timestamp = new Date(nowMs).toISOString()
            const stageUpdate = {
                ...(suspendProfile
                    ? {
                        status: 'suspended',
                        suspended_at: profile.suspended_at || timestamp,
                    }
                    : {}),
                auth_sync_status: 'pending',
                auth_sync_target: status,
                auth_sync_operation_id: operationId,
                auth_sync_updated_at: timestamp,
                updated_at: timestamp,
            }
            transaction.set(profileRef, stageUpdate, { merge: true })
            writeAuditLog({
                transaction,
                actor: context,
                action: recoveringStaleSync
                    ? 'user.status_sync_recovered'
                    : 'user.status_sync_staged',
                entity_type: 'profile',
                entity_id: userId,
                metadata: buildStatusSyncAuditMetadata({
                    operationId,
                    targetStatus: status,
                    previousStatus: profile.status,
                    recoveredFrom: recoveringStaleSync
                        ? {
                            operationId: profile.auth_sync_operation_id,
                            updatedAt: profile.auth_sync_updated_at,
                        }
                        : null,
                }),
            })
        })
    }

    const markSyncFailure = async () => {
        await adminDb.runTransaction(async (transaction) => {
            const profileSnap = await transaction.get(profileRef)
            const timestamp = new Date().toISOString()
            const ownsSyncMarker = profileSnap.exists
                && profileSnap.data().auth_sync_operation_id === operationId
            if (ownsSyncMarker) {
                transaction.set(profileRef, {
                    status: 'suspended',
                    suspended_at: profileSnap.data().suspended_at || timestamp,
                    auth_sync_status: 'failed',
                    auth_sync_target: status,
                    auth_sync_updated_at: timestamp,
                    updated_at: timestamp,
                }, { merge: true })
            }
            writeAuditLog({
                transaction,
                actor: context,
                action: 'user.status_sync_failed',
                entity_type: 'profile',
                entity_id: userId,
                metadata: {
                    ...buildStatusSyncAuditMetadata({
                        operationId,
                        targetStatus: status,
                        previousStatus,
                    }),
                    sync_marker_updated: ownsSyncMarker,
                },
            })
        })
    }

    const commitStatus = async (nextStatus) => {
        await adminDb.runTransaction(async (transaction) => {
            const profileSnap = await transaction.get(profileRef)
            if (!profileSnap.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')
            const profile = fromFirestoreDocument(profileSnap)
            if (profile.auth_sync_operation_id !== operationId || profile.auth_sync_status !== 'pending') {
                throw new ApiError(409, 'Account status changed during synchronization.', 'status_sync_conflict')
            }

            const timestamp = new Date().toISOString()
            const update = {
                status: nextStatus,
                suspended_at: nextStatus === 'suspended' ? profile.suspended_at || timestamp : null,
                auth_sync_status: 'in_sync',
                auth_sync_target: null,
                auth_sync_operation_id: operationId,
                auth_sync_updated_at: timestamp,
                updated_at: timestamp,
            }
            updatedProfile = { ...profile, ...update }
            transaction.set(profileRef, update, { merge: true })
            writeAuditLog({
                transaction,
                actor: context,
                action: nextStatus === 'suspended' ? 'user.suspended' : 'user.reactivated',
                entity_type: 'profile',
                entity_id: userId,
                metadata: {
                    previous_status: previousStatus,
                    status: nextStatus,
                    auth_synchronized: true,
                },
            })
        })
    }

    await synchronizeUserStatusChange({
        nextStatus: status,
        stageSuspension: () => stageChange({ suspendProfile: true }),
        stageActivation: () => stageChange({ suspendProfile: false }),
        finalizeSuspension: () => commitStatus('suspended'),
        markSuspensionSyncFailure: markSyncFailure,
        markActivationSyncFailure: markSyncFailure,
        setAuthDisabled: (disabled) => adminAuth.updateUser(userId, { disabled }),
        commitActivation: () => commitStatus('active'),
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
