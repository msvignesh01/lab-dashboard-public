import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    profileRef: {
        get: vi.fn(),
        set: vi.fn(),
    },
    transactionGet: vi.fn(),
    transactionSet: vi.fn(),
    runTransaction: vi.fn(),
    writeAuditLog: vi.fn(),
    verifyFirebaseIdToken: vi.fn(),
}))

vi.mock('./firebaseAdmin.js', () => ({
    adminAuth: {},
    adminDb: {
        collection: vi.fn(() => ({ doc: vi.fn(() => mocks.profileRef) })),
        runTransaction: mocks.runTransaction,
    },
    FieldValue: { serverTimestamp: vi.fn() },
}))
vi.mock('./audit.js', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('./authPolicy.js', () => ({ verifyFirebaseIdToken: mocks.verifyFirebaseIdToken }))

import { getAuthenticatedContext } from './authContext.js'

const request = { headers: { authorization: 'Bearer valid-token' } }
const studentToken = {
    uid: 'student-1',
    email: 'student.one@btech.christuniversity.in',
    email_verified: true,
}
const studentProfile = {
    id: studentToken.uid,
    email: studentToken.email,
    role: 'student',
    requested_role: 'student',
    status: 'active',
    email_verified_at: '2026-07-15T00:00:00.000Z',
}

const snapshot = (profile, id = studentToken.uid) => ({
    exists: Boolean(profile),
    id,
    data: () => profile,
})

beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.BOOTSTRAP_ADMIN_EMAILS
    mocks.verifyFirebaseIdToken.mockResolvedValue(studentToken)
    mocks.profileRef.get.mockResolvedValue(snapshot(studentProfile))
    mocks.transactionGet.mockResolvedValue(snapshot(null))
    mocks.runTransaction.mockImplementation(async (callback) => callback({
        get: mocks.transactionGet,
        set: mocks.transactionSet,
    }))
    mocks.writeAuditLog.mockResolvedValue(undefined)
})

afterEach(() => {
    delete process.env.BOOTSTRAP_ADMIN_EMAILS
})

describe('authenticated profile identity binding', () => {
    it('authorizes a normalized matching institutional identity', async () => {
        mocks.verifyFirebaseIdToken.mockResolvedValue({
            ...studentToken,
            email: 'Student.One@btech.christuniversity.in',
        })

        const context = await getAuthenticatedContext(request, {
            requireActive: true,
            roles: ['student'],
        })

        expect(context.uid).toBe(studentToken.uid)
        expect(context.email).toBe(studentToken.email)
        expect(context.profile).toMatchObject(studentProfile)
        expect(mocks.profileRef.set).not.toHaveBeenCalled()
    })

    it('rejects immutable profile-email and role/domain conflicts before writes', async () => {
        mocks.profileRef.get.mockResolvedValueOnce(snapshot({
            ...studentProfile,
            email: 'student.two@btech.christuniversity.in',
        }))
        await expect(getAuthenticatedContext(request)).rejects.toMatchObject({
            status: 403,
            code: 'profile_identity_mismatch',
        })

        mocks.profileRef.get.mockResolvedValueOnce(snapshot({
            ...studentProfile,
            role: 'admin',
        }))
        await expect(getAuthenticatedContext(request)).rejects.toMatchObject({
            status: 403,
            code: 'profile_role_mismatch',
        })
        expect(mocks.profileRef.set).not.toHaveBeenCalled()
    })

    it('rejects unsupported institutional domains even when Auth and profile match', async () => {
        const externalToken = {
            uid: 'external-1',
            email: 'person@example.com',
            email_verified: true,
        }
        mocks.verifyFirebaseIdToken.mockResolvedValue(externalToken)
        mocks.profileRef.get.mockResolvedValue(snapshot({
            id: externalToken.uid,
            email: externalToken.email,
            role: 'student',
            status: 'active',
            email_verified_at: '2026-07-15T00:00:00.000Z',
        }, externalToken.uid))

        await expect(getAuthenticatedContext(request)).rejects.toMatchObject({
            status: 403,
            code: 'unsupported_profile_email_domain',
        })
    })
})

describe('bootstrap administrator provisioning', () => {
    const bootstrapToken = {
        uid: 'bootstrap-1',
        email: 'bootstrap.admin@christuniversity.in',
        email_verified: true,
        name: 'Bootstrap Admin',
    }

    beforeEach(() => {
        process.env.BOOTSTRAP_ADMIN_EMAILS = bootstrapToken.email
        mocks.verifyFirebaseIdToken.mockResolvedValue(bootstrapToken)
        mocks.transactionGet.mockResolvedValue(snapshot(null, bootstrapToken.uid))
    })

    it('creates the profile and audit entry in one transaction', async () => {
        const context = await getAuthenticatedContext(request, {
            requireActive: true,
            roles: ['admin'],
        })

        expect(context.isBootstrapAdmin).toBe(true)
        expect(context.profile).toMatchObject({
            id: bootstrapToken.uid,
            email: bootstrapToken.email,
            role: 'admin',
            status: 'active',
        })
        expect(mocks.transactionSet).toHaveBeenCalledWith(
            mocks.profileRef,
            expect.objectContaining({ id: bootstrapToken.uid, role: 'admin' }),
        )
        expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            transaction: expect.objectContaining({ set: mocks.transactionSet }),
            action: 'admin.bootstrap_provisioned',
            entity_id: bootstrapToken.uid,
        }))
        expect(mocks.profileRef.set).not.toHaveBeenCalled()
    })

    it('does not swallow an audit failure from the provisioning transaction', async () => {
        mocks.writeAuditLog.mockRejectedValue(new Error('audit unavailable'))

        await expect(getAuthenticatedContext(request)).rejects.toThrow('audit unavailable')
        expect(mocks.transactionSet).toHaveBeenCalledTimes(1)
    })

    it('never elevates a conflicting existing profile identity', async () => {
        mocks.transactionGet.mockResolvedValue(snapshot({
            id: bootstrapToken.uid,
            email: 'other.faculty@christuniversity.in',
            role: 'faculty',
            status: 'active',
        }, bootstrapToken.uid))

        await expect(getAuthenticatedContext(request)).rejects.toMatchObject({
            status: 403,
            code: 'profile_identity_mismatch',
        })
        expect(mocks.transactionSet).not.toHaveBeenCalled()
        expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    })

    it('requires verified faculty-domain tokens even when allowlisted', async () => {
        mocks.verifyFirebaseIdToken.mockResolvedValue({ ...bootstrapToken, email_verified: false })
        await expect(getAuthenticatedContext(request, { requireVerified: false })).rejects.toMatchObject({
            status: 403,
            code: 'email_not_verified',
        })

        const studentBootstrap = {
            ...bootstrapToken,
            email: 'bootstrap.admin@btech.christuniversity.in',
        }
        process.env.BOOTSTRAP_ADMIN_EMAILS = studentBootstrap.email
        mocks.verifyFirebaseIdToken.mockResolvedValue(studentBootstrap)
        await expect(getAuthenticatedContext(request)).rejects.toMatchObject({
            status: 403,
            code: 'invalid_bootstrap_admin_domain',
        })
        expect(mocks.runTransaction).not.toHaveBeenCalled()
    })
})
