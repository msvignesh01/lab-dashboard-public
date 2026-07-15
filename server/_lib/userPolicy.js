import { ApiError } from './http.js'
import { assertAuthorizedProfileIdentity } from './profilePolicy.js'

const VALID_USER_STATUSES = new Set(['active', 'suspended'])
const VALID_USER_ROLES = new Set(['student', 'faculty', 'admin'])
const RECONCILABLE_AUTH_STATES = new Set(['failed'])

export const AUTH_SYNC_LEASE_MS = 15 * 60_000

export const isPendingAuthSyncRecoverable = (profile, nowMs = Date.now()) => {
    if (
        !profile
        || profile.auth_sync_status !== 'pending'
        || !VALID_USER_STATUSES.has(profile.auth_sync_target)
    ) {
        return false
    }

    const updatedAtMs = Date.parse(profile.auth_sync_updated_at)
    if (!Number.isFinite(updatedAtMs) || !Number.isFinite(nowMs) || updatedAtMs > nowMs) {
        return false
    }
    return nowMs - updatedAtMs >= AUTH_SYNC_LEASE_MS
}

export const buildStatusSyncAuditMetadata = ({
    operationId,
    targetStatus,
    previousStatus = null,
    recoveredFrom = null,
}) => {
    const metadata = {
        operation_id: String(operationId || '').slice(0, 128),
        target_status: targetStatus,
        previous_status: previousStatus,
    }
    if (recoveredFrom) {
        metadata.recovery = true
        metadata.previous_operation_id = String(recoveredFrom.operationId || '').slice(0, 128)
        metadata.previous_sync_updated_at = String(recoveredFrom.updatedAt || '').slice(0, 64)
    }
    return metadata
}

export const toBookingReviewerProfileSummary = (profile) => {
    if (!profile || typeof profile !== 'object') return null
    return {
        id: String(profile.id || ''),
        full_name: typeof profile.full_name === 'string' ? profile.full_name : '',
    }
}

export const parseUserStatus = (value) => {
    const status = typeof value === 'string' ? value.trim() : ''
    if (!VALID_USER_STATUSES.has(status)) {
        throw new ApiError(400, 'Invalid user status.', 'invalid_status')
    }
    return status
}

export const parseUserRole = (value) => {
    const role = typeof value === 'string' ? value.trim() : ''
    if (!VALID_USER_ROLES.has(role)) {
        throw new ApiError(400, 'Invalid role.', 'invalid_role')
    }
    return role
}

export const assertRoleTargetIdentity = ({ authUser, profile, nextRole }) => {
    if (!authUser || authUser.emailVerified !== true) {
        throw new ApiError(
            409,
            'The target account must have a verified institutional Firebase Auth identity.',
            'target_identity_not_verified',
        )
    }

    try {
        assertAuthorizedProfileIdentity({
            decodedToken: authUser,
            profile: { ...profile, role: nextRole },
        })
    } catch {
        throw new ApiError(
            409,
            'The requested role does not match the target account identity.',
            'target_role_identity_mismatch',
        )
    }
}

const assertNotSelf = (actorUid, targetUid, operation) => {
    if (actorUid === targetUid) {
        throw new ApiError(409, `You cannot change your own ${operation}.`, `self_${operation.replace(' ', '_')}_change`)
    }
}

const assertNotLastActiveAdmin = (profile, activeAdminCount, operation) => {
    if (profile.role === 'admin' && profile.status === 'active' && activeAdminCount <= 1) {
        throw new ApiError(409, `The last active administrator cannot be ${operation}.`, 'last_active_admin')
    }
}

export const assertRoleMutationAllowed = ({
    actorUid,
    targetUid,
    profile,
    nextRole,
    activeAdminCount = Number.POSITIVE_INFINITY,
}) => {
    assertNotSelf(actorUid, targetUid, 'role')
    if (!profile || !VALID_USER_ROLES.has(profile.role)) {
        throw new ApiError(409, 'The current account role is invalid.', 'invalid_current_role')
    }
    if (!VALID_USER_ROLES.has(nextRole)) {
        throw new ApiError(400, 'Invalid role.', 'invalid_role')
    }
    if (!VALID_USER_STATUSES.has(profile.status)) {
        throw new ApiError(
            409,
            'Pending faculty requests must be approved or rejected through the access-request workflow.',
            'role_transition_not_allowed',
        )
    }
    if (profile.auth_sync_status === 'pending') {
        throw new ApiError(409, 'An account-status synchronization is in progress.', 'status_sync_in_progress')
    }
    if (profile.role === nextRole) {
        throw new ApiError(409, 'The account already has this role.', 'role_unchanged')
    }
    if (profile.role === 'admin' && nextRole !== 'admin') {
        assertNotLastActiveAdmin(profile, activeAdminCount, 'demoted')
    }
}

export const assertStatusMutationAllowed = ({
    actorUid,
    targetUid,
    profile,
    nextStatus,
    activeAdminCount = Number.POSITIVE_INFINITY,
    nowMs = Date.now(),
}) => {
    assertNotSelf(actorUid, targetUid, 'access status')
    if (!profile || !VALID_USER_STATUSES.has(profile.status)) {
        throw new ApiError(
            409,
            'Pending faculty requests must be approved or rejected through the access-request workflow.',
            'status_transition_not_allowed',
        )
    }
    if (!VALID_USER_STATUSES.has(nextStatus)) {
        throw new ApiError(400, 'Invalid user status.', 'invalid_status')
    }
    const isRecoverablePendingSync = profile.auth_sync_status === 'pending'
        && profile.auth_sync_target === nextStatus
        && isPendingAuthSyncRecoverable(profile, nowMs)
    if (profile.auth_sync_status === 'pending' && !isRecoverablePendingSync) {
        throw new ApiError(409, 'An account-status synchronization is already in progress.', 'status_sync_in_progress')
    }
    if (
        RECONCILABLE_AUTH_STATES.has(profile.auth_sync_status)
        && profile.auth_sync_target !== nextStatus
    ) {
        throw new ApiError(
            409,
            'Retry the interrupted account-status target before requesting a different state.',
            'status_sync_target_locked',
        )
    }
    const isReconciliation = isRecoverablePendingSync
        || (RECONCILABLE_AUTH_STATES.has(profile.auth_sync_status)
            && profile.auth_sync_target === nextStatus)
    if (profile.status === nextStatus && !isReconciliation) {
        throw new ApiError(409, 'The account already has this access status.', 'status_unchanged')
    }
    if (profile.status === 'active' && nextStatus === 'suspended') {
        assertNotLastActiveAdmin(profile, activeAdminCount, 'suspended')
    }
}

const statusSyncError = () => new ApiError(
    503,
    'Account status could not be synchronized. No successful change was reported.',
    'status_sync_failed',
)

// Firebase Auth and Firestore cannot participate in one atomic transaction.
// Suspension therefore blocks the profile first, then disables Auth. Activation
// enables Auth first but leaves the profile suspended until the database commit;
// a failed activation commit is compensated by disabling Auth again.
export const synchronizeUserStatusChange = async ({
    nextStatus,
    stageSuspension,
    stageActivation,
    finalizeSuspension,
    markSuspensionSyncFailure,
    markActivationSyncFailure,
    setAuthDisabled,
    commitActivation,
}) => {
    if (nextStatus === 'suspended') {
        await stageSuspension()
        try {
            await setAuthDisabled(true)
        } catch {
            try {
                await markSuspensionSyncFailure()
            } catch {
                // The staged suspended profile remains fail-closed even when the
                // diagnostic marker cannot be updated.
            }
            throw statusSyncError()
        }

        try {
            await finalizeSuspension()
        } catch {
            try {
                await markSuspensionSyncFailure()
            } catch {
                // The profile and Auth account are both already blocked.
            }
            throw statusSyncError()
        }
        return
    }

    await stageActivation()
    try {
        await setAuthDisabled(false)
    } catch {
        try {
            await markActivationSyncFailure()
        } catch {
            // The profile was deliberately left suspended during activation.
        }
        throw statusSyncError()
    }

    try {
        await commitActivation()
    } catch (error) {
        // A stale-lease recovery may have atomically taken ownership after this
        // operation enabled Auth. The new owner has the same target and is now
        // responsible for commit or compensation; disabling Auth here could race
        // with and undo that recovery.
        if (error?.code === 'status_sync_conflict') {
            try {
                await markActivationSyncFailure()
            } catch {
                // The new owner retains the authoritative synchronization marker.
            }
            throw error
        }
        try {
            await setAuthDisabled(true)
        } catch {
            // The Firestore profile is still suspended, so application and rules
            // authorization remain fail-closed even if compensation is delayed.
        }
        try {
            await markActivationSyncFailure()
        } catch {
            // The profile remains suspended even if the diagnostic write fails.
        }
        throw statusSyncError()
    }
}
