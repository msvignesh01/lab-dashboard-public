import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const profileRef = { path: 'profiles/student-1' }
    return {
        profileRef,
        get: vi.fn(),
        set: vi.fn(),
        runTransaction: vi.fn(),
        writeAuditLog: vi.fn(),
        verifyFirebaseIdToken: vi.fn(),
        assertRateLimit: vi.fn(),
    }
})

vi.mock('../../_lib/firebaseAdmin.js', () => ({
    adminAuth: {},
    adminDb: {
        collection: vi.fn(() => ({ doc: vi.fn(() => mocks.profileRef) })),
        runTransaction: mocks.runTransaction,
    },
}))
vi.mock('../../_lib/audit.js', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('../../_lib/authPolicy.js', () => ({ verifyFirebaseIdToken: mocks.verifyFirebaseIdToken }))
vi.mock('../../_lib/rateLimit.js', () => ({ assertRateLimit: mocks.assertRateLimit }))

import registerProfile from './register.js'

const token = {
    uid: 'student-1',
    email: 'student.one@btech.christuniversity.in',
    email_verified: false,
}
const body = {
    uid: 'student-1',
    email: 'student.one@btech.christuniversity.in',
    full_name: 'Student One',
    role: 'student',
    department: 'CSE',
    phone: '+91 98765 43210',
    register_number: '24680135',
    specialization: 'Computer Science and Engineering',
    year_of_passout: '2028',
}

const createResponse = () => {
    const response = {
        statusCode: null,
        payload: null,
        status: vi.fn((statusCode) => {
            response.statusCode = statusCode
            return response
        }),
        json: vi.fn((payload) => {
            response.payload = payload
            return response
        }),
    }
    return response
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.verifyFirebaseIdToken.mockResolvedValue(token)
    mocks.assertRateLimit.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.runTransaction.mockImplementation(async (callback) => callback({
        get: mocks.get,
        set: mocks.set,
    }))
})

describe('POST /api/profile/register', () => {
    it('creates the profile and audit entry in the same transaction', async () => {
        mocks.get.mockResolvedValue({ exists: false })
        const response = createResponse()

        await registerProfile({
            method: 'POST',
            headers: { authorization: 'Bearer valid-token' },
            body,
        }, response)

        expect(response.statusCode).toBe(201)
        expect(response.payload.error).toBeNull()
        expect(response.payload.data).toMatchObject({
            created: true,
            profile: { id: token.uid, role: 'student', status: 'active' },
        })
        expect(mocks.set).toHaveBeenCalledWith(
            mocks.profileRef,
            expect.objectContaining({ id: token.uid, email: token.email }),
        )
        expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            transaction: expect.objectContaining({ set: mocks.set }),
            action: 'profile.registered',
            entity_id: token.uid,
        }))
    })

    it('returns an existing matching profile without a duplicate write or audit record', async () => {
        const existingProfile = {
            ...body,
            id: token.uid,
            requested_role: 'student',
            status: 'active',
            approved_by: null,
            approved_at: null,
            suspended_at: null,
            email_verified_at: null,
            created_at: '2026-07-15T00:00:00.000Z',
            updated_at: '2026-07-15T00:00:00.000Z',
        }
        delete existingProfile.uid
        mocks.get.mockResolvedValue({
            exists: true,
            id: token.uid,
            data: () => existingProfile,
        })
        const response = createResponse()

        await registerProfile({
            method: 'POST',
            headers: { authorization: 'Bearer valid-token' },
            body,
        }, response)

        expect(response.statusCode).toBe(200)
        expect(response.payload.data).toMatchObject({ created: false, profile: existingProfile })
        expect(mocks.set).not.toHaveBeenCalled()
        expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    })
})
