import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const profileRef = { path: 'profiles/student-1' }
    return {
        profileRef,
        get: vi.fn(),
        update: vi.fn(),
        runTransaction: vi.fn(),
        writeAuditLog: vi.fn(),
        getAuthenticatedContext: vi.fn(),
        assertRateLimit: vi.fn(),
    }
})

vi.mock('../../_lib/firebaseAdmin.js', () => ({
    adminDb: { runTransaction: mocks.runTransaction },
}))
vi.mock('../../_lib/audit.js', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('../../_lib/authContext.js', () => ({ getAuthenticatedContext: mocks.getAuthenticatedContext }))
vi.mock('../../_lib/rateLimit.js', () => ({ assertRateLimit: mocks.assertRateLimit }))

import profileMe from './me.js'

const storedProfile = {
    id: 'student-1',
    email: 'student.one@btech.christuniversity.in',
    full_name: 'Student One',
    role: 'student',
    requested_role: 'student',
    status: 'active',
    department: 'CSE',
    phone: '+91 98765 43210',
    register_number: '24680135',
    specialization: 'Computer Science and Engineering',
    year_of_passout: '2028',
    approved_by: null,
    approved_at: null,
    suspended_at: null,
    email_verified_at: '2026-07-15T00:00:00.000Z',
    created_at: '2026-07-15T00:00:00.000Z',
    updated_at: '2026-07-15T00:00:00.000Z',
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
    mocks.getAuthenticatedContext.mockResolvedValue({
        uid: storedProfile.id,
        profile: storedProfile,
        profileRef: mocks.profileRef,
    })
    mocks.assertRateLimit.mockResolvedValue(undefined)
    mocks.writeAuditLog.mockResolvedValue(undefined)
    mocks.get.mockResolvedValue({
        exists: true,
        id: storedProfile.id,
        data: () => storedProfile,
    })
    mocks.runTransaction.mockImplementation(async (callback) => callback({
        get: mocks.get,
        update: mocks.update,
    }))
})

describe('/api/profile/me', () => {
    it('updates editable fields and writes the audit record in the same transaction', async () => {
        const response = createResponse()

        await profileMe({
            method: 'PATCH',
            headers: { authorization: 'Bearer valid-token' },
            body: { full_name: 'Student Updated' },
        }, response)

        expect(response.statusCode).toBe(200)
        expect(response.payload.data).toMatchObject({
            id: storedProfile.id,
            full_name: 'Student Updated',
            role: 'student',
            status: 'active',
        })
        expect(mocks.update).toHaveBeenCalledWith(mocks.profileRef, {
            full_name: 'Student Updated',
            updated_at: expect.any(String),
        })
        expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            transaction: expect.objectContaining({ update: mocks.update }),
            action: 'profile.updated',
            entity_id: storedProfile.id,
            metadata: { changed_fields: ['full_name'] },
        }))
    })

    it('rejects privileged fields without mutating the profile', async () => {
        const response = createResponse()

        await profileMe({
            method: 'PATCH',
            headers: { authorization: 'Bearer valid-token' },
            body: { role: 'admin' },
        }, response)

        expect(response.statusCode).toBe(400)
        expect(response.payload.error.code).toBe('unsupported_profile_field')
        expect(mocks.update).not.toHaveBeenCalled()
        expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    })
})
