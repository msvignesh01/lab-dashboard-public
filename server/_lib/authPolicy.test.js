import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './http.js'
import { verifyFirebaseIdToken } from './authPolicy.js'

describe('Firebase token policy', () => {
    it('verifies tokens with revocation checking enabled', async () => {
        const decoded = { uid: 'student-1', email_verified: true }
        const verifyIdToken = vi.fn().mockResolvedValue(decoded)

        await expect(verifyFirebaseIdToken({ verifyIdToken }, 'token')).resolves.toBe(decoded)
        expect(verifyIdToken).toHaveBeenCalledWith('token', true)
    })

    it('maps all verification failures to a non-leaking 401', async () => {
        const verifyIdToken = vi.fn().mockRejectedValue(new Error('certificate internals'))

        try {
            await verifyFirebaseIdToken({ verifyIdToken }, 'bad-token')
            throw new Error('Expected verification to fail')
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError)
            expect(error.status).toBe(401)
            expect(error.code).toBe('invalid_auth_token')
            expect(error.message).toBe('Authentication required')
            expect(error.message).not.toContain('certificate')
        }
    })
})
