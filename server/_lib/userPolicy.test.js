import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './http.js'
import {
    AUTH_SYNC_LEASE_MS,
    assertRoleMutationAllowed,
    assertRoleTargetIdentity,
    assertStatusMutationAllowed,
    buildStatusSyncAuditMetadata,
    isPendingAuthSyncRecoverable,
    parseUserStatus,
    synchronizeUserStatusChange,
    toBookingReviewerProfileSummary,
} from './userPolicy.js'

describe('user status policy', () => {
    it('binds role grants to a verified matching institutional Auth identity', () => {
        const facultyProfile = {
            id: 'faculty-1',
            email: 'faculty.one@christuniversity.in',
            role: 'faculty',
        }
        expect(() => assertRoleTargetIdentity({
            authUser: {
                uid: 'faculty-1',
                email: 'faculty.one@christuniversity.in',
                emailVerified: true,
            },
            profile: facultyProfile,
            nextRole: 'admin',
        })).not.toThrow()

        expect(() => assertRoleTargetIdentity({
            authUser: {
                uid: 'student-1',
                email: 'student.one@btech.christuniversity.in',
                emailVerified: true,
            },
            profile: {
                id: 'student-1',
                email: 'student.one@btech.christuniversity.in',
                role: 'student',
            },
            nextRole: 'admin',
        })).toThrowError(expect.objectContaining({ code: 'target_role_identity_mismatch' }))

        for (const authUser of [
            { uid: 'faculty-1', email: 'different@christuniversity.in', emailVerified: true },
            { uid: 'faculty-1', email: 'faculty.one@christuniversity.in', emailVerified: false },
        ]) {
            expect(() => assertRoleTargetIdentity({ authUser, profile: facultyProfile, nextRole: 'admin' }))
                .toThrow(ApiError)
        }
    })

    it('accepts only active and suspended', () => {
        expect(parseUserStatus('active')).toBe('active')
        expect(parseUserStatus(' suspended ')).toBe('suspended')
    })

    it('projects reviewer booking profiles without exposing contact or authorization data', () => {
        expect(toBookingReviewerProfileSummary({
            id: 'student-1',
            full_name: 'Student One',
            email: 'private@example.edu',
            phone: '9999999999',
            role: 'student',
            status: 'active',
        })).toEqual({ id: 'student-1', full_name: 'Student One' })
    })

    it.each([undefined, '', 'pending_approval', 'disabled', true])('rejects invalid status %p', (value) => {
        expect(() => parseUserStatus(value)).toThrow(ApiError)
        try {
            parseUserStatus(value)
        } catch (error) {
            expect(error.status).toBe(400)
            expect(error.code).toBe('invalid_status')
        }
    })

    it('does not let role changes activate or bypass pending/suspended account workflow', () => {
        expect(() => assertRoleMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'faculty-1',
            profile: { role: 'faculty', status: 'pending_approval' },
            nextRole: 'student',
        })).toThrowError(expect.objectContaining({ code: 'role_transition_not_allowed' }))

        expect(() => assertRoleMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: { role: 'student', status: 'suspended' },
            nextRole: 'faculty',
        })).not.toThrow()
    })

    it('protects self-mutations and the last active administrator', () => {
        expect(() => assertRoleMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'admin-1',
            profile: { role: 'admin', status: 'active' },
            nextRole: 'faculty',
        })).toThrowError(expect.objectContaining({ code: 'self_role_change' }))

        expect(() => assertRoleMutationAllowed({
            actorUid: 'admin-2',
            targetUid: 'admin-1',
            profile: { role: 'admin', status: 'active' },
            nextRole: 'faculty',
            activeAdminCount: 1,
        })).toThrowError(expect.objectContaining({ code: 'last_active_admin' }))

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-2',
            targetUid: 'admin-1',
            profile: { role: 'admin', status: 'active' },
            nextStatus: 'suspended',
            activeAdminCount: 1,
        })).toThrowError(expect.objectContaining({ code: 'last_active_admin' }))
    })

    it('allows only legal status transitions or same-target sync reconciliation', () => {
        const nowMs = Date.parse('2026-07-15T12:00:00.000Z')
        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'faculty-1',
            profile: { role: 'faculty', status: 'pending_approval' },
            nextStatus: 'active',
        })).toThrowError(expect.objectContaining({ code: 'status_transition_not_allowed' }))

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: { role: 'student', status: 'suspended' },
            nextStatus: 'suspended',
        })).toThrowError(expect.objectContaining({ code: 'status_unchanged' }))

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: {
                role: 'student',
                status: 'suspended',
                auth_sync_status: 'failed',
                auth_sync_target: 'suspended',
            },
            nextStatus: 'suspended',
            nowMs,
        })).not.toThrow()

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: {
                role: 'student',
                status: 'suspended',
                auth_sync_status: 'failed',
                auth_sync_target: 'active',
            },
            nextStatus: 'suspended',
            nowMs,
        })).toThrowError(expect.objectContaining({ code: 'status_sync_target_locked' }))

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: {
                role: 'student',
                status: 'suspended',
                auth_sync_status: 'pending',
                auth_sync_target: 'suspended',
                auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS + 1).toISOString(),
            },
            nextStatus: 'suspended',
            nowMs,
        })).toThrowError(expect.objectContaining({ code: 'status_sync_in_progress' }))

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: {
                role: 'student',
                status: 'suspended',
                auth_sync_status: 'pending',
                auth_sync_target: 'suspended',
                auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS).toISOString(),
            },
            nextStatus: 'suspended',
            nowMs,
        })).not.toThrow()

        expect(() => assertStatusMutationAllowed({
            actorUid: 'admin-1',
            targetUid: 'student-1',
            profile: {
                role: 'student',
                status: 'suspended',
                auth_sync_status: 'pending',
                auth_sync_target: 'active',
                auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS - 1).toISOString(),
            },
            nextStatus: 'suspended',
            nowMs,
        })).toThrowError(expect.objectContaining({ code: 'status_sync_in_progress' }))
    })

    it('exposes stale pending synchronization only after a valid same-target lease expires', () => {
        const nowMs = Date.parse('2026-07-15T12:00:00.000Z')
        const baseProfile = {
            auth_sync_status: 'pending',
            auth_sync_target: 'active',
        }

        expect(isPendingAuthSyncRecoverable({
            ...baseProfile,
            auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS).toISOString(),
        }, nowMs)).toBe(true)
        expect(isPendingAuthSyncRecoverable({
            ...baseProfile,
            auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS + 1).toISOString(),
        }, nowMs)).toBe(false)
        expect(isPendingAuthSyncRecoverable({ ...baseProfile, auth_sync_updated_at: 'invalid' }, nowMs)).toBe(false)
        expect(isPendingAuthSyncRecoverable({
            ...baseProfile,
            auth_sync_updated_at: new Date(nowMs + 1).toISOString(),
        }, nowMs)).toBe(false)
        expect(isPendingAuthSyncRecoverable({
            ...baseProfile,
            auth_sync_target: 'pending_approval',
            auth_sync_updated_at: new Date(nowMs - AUTH_SYNC_LEASE_MS).toISOString(),
        }, nowMs)).toBe(false)
    })

    it('builds non-sensitive audit metadata for staged and failed sync operations', () => {
        expect(buildStatusSyncAuditMetadata({
            operationId: 'operation-1',
            targetStatus: 'suspended',
            previousStatus: 'active',
            email: 'must-not-appear@example.edu',
        })).toEqual({
            operation_id: 'operation-1',
            target_status: 'suspended',
            previous_status: 'active',
        })

        expect(buildStatusSyncAuditMetadata({
            operationId: 'operation-2',
            targetStatus: 'active',
            previousStatus: 'suspended',
            recoveredFrom: {
                operationId: 'operation-1',
                updatedAt: '2026-07-15T11:40:00.000Z',
                email: 'must-not-appear@example.edu',
            },
        })).toEqual({
            operation_id: 'operation-2',
            target_status: 'active',
            previous_status: 'suspended',
            recovery: true,
            previous_operation_id: 'operation-1',
            previous_sync_updated_at: '2026-07-15T11:40:00.000Z',
        })
    })

    it('stages suspension before Auth and never reports Auth failure as success', async () => {
        const calls = []
        const stageSuspension = vi.fn(async () => calls.push('stage'))
        const setAuthDisabled = vi.fn(async (disabled) => {
            calls.push(`auth:${disabled}`)
            throw new Error('firebase unavailable')
        })
        const markSuspensionSyncFailure = vi.fn(async () => calls.push('mark-failed'))
        const finalizeSuspension = vi.fn(async () => calls.push('finalize'))

        await expect(synchronizeUserStatusChange({
            nextStatus: 'suspended',
            stageSuspension,
            stageActivation: vi.fn(),
            finalizeSuspension,
            markSuspensionSyncFailure,
            markActivationSyncFailure: vi.fn(),
            setAuthDisabled,
            commitActivation: vi.fn(),
        })).rejects.toMatchObject({ status: 503, code: 'status_sync_failed' })

        expect(calls).toEqual(['stage', 'auth:true', 'mark-failed'])
        expect(finalizeSuspension).not.toHaveBeenCalled()
    })

    it('compensates a failed activation commit by disabling Auth again', async () => {
        const calls = []
        await expect(synchronizeUserStatusChange({
            nextStatus: 'active',
            stageSuspension: vi.fn(),
            stageActivation: vi.fn(async () => calls.push('stage')),
            finalizeSuspension: vi.fn(),
            markSuspensionSyncFailure: vi.fn(),
            markActivationSyncFailure: vi.fn(async () => calls.push('mark-failed')),
            setAuthDisabled: vi.fn(async (disabled) => calls.push(`auth:${disabled}`)),
            commitActivation: vi.fn(async () => {
                calls.push('commit')
                throw new Error('firestore unavailable')
            }),
        })).rejects.toMatchObject({ status: 503, code: 'status_sync_failed' })

        expect(calls).toEqual(['stage', 'auth:false', 'commit', 'auth:true', 'mark-failed'])
    })

    it('does not undo a newer stale-lease activation owner after a commit conflict', async () => {
        const calls = []
        const conflict = new ApiError(
            409,
            'Account status changed during synchronization.',
            'status_sync_conflict',
        )

        await expect(synchronizeUserStatusChange({
            nextStatus: 'active',
            stageSuspension: vi.fn(),
            stageActivation: vi.fn(async () => calls.push('stage')),
            finalizeSuspension: vi.fn(),
            markSuspensionSyncFailure: vi.fn(),
            markActivationSyncFailure: vi.fn(async () => calls.push('mark-conflict')),
            setAuthDisabled: vi.fn(async (disabled) => calls.push(`auth:${disabled}`)),
            commitActivation: vi.fn(async () => {
                calls.push('commit')
                throw conflict
            }),
        })).rejects.toBe(conflict)

        expect(calls).toEqual(['stage', 'auth:false', 'commit', 'mark-conflict'])
    })

    it('marks a safely blocked suspension for reconciliation when finalization fails', async () => {
        const markSuspensionSyncFailure = vi.fn()
        await expect(synchronizeUserStatusChange({
            nextStatus: 'suspended',
            stageSuspension: vi.fn(),
            stageActivation: vi.fn(),
            finalizeSuspension: vi.fn().mockRejectedValue(new Error('write outcome unknown')),
            markSuspensionSyncFailure,
            markActivationSyncFailure: vi.fn(),
            setAuthDisabled: vi.fn(),
            commitActivation: vi.fn(),
        })).rejects.toMatchObject({ status: 503, code: 'status_sync_failed' })
        expect(markSuspensionSyncFailure).toHaveBeenCalledOnce()
    })
})
