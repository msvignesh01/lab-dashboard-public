import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timestamp } from 'firebase-admin/firestore'

vi.mock('./firebaseAdmin.js', () => ({
    adminDb: {
        collection: vi.fn(),
        runTransaction: vi.fn(),
    },
}))

import { adminDb } from './firebaseAdmin.js'
import { assertRateLimit } from './rateLimit.js'

describe('rate limit persistence', () => {
    const ref = { id: 'student-1_machine_create_10' }
    const set = vi.fn()

    beforeEach(() => {
        vi.clearAllMocks()
        adminDb.collection.mockReturnValue({ doc: vi.fn(() => ref) })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('stores expires_at as a Firestore Timestamp suitable for TTL', async () => {
        const windowMs = 60_000
        const now = 10 * windowMs + 1_000
        vi.spyOn(Date, 'now').mockReturnValue(now)
        adminDb.runTransaction.mockImplementation(async (callback) => callback({
            get: vi.fn().mockResolvedValue({ exists: false }),
            set,
        }))

        await assertRateLimit({
            uid: 'student-1',
            action: 'machine_create',
            limit: 5,
            windowMs,
        })

        const record = set.mock.calls[0][1]
        expect(record.expires_at).toBeInstanceOf(Timestamp)
        expect(record.expires_at.toMillis()).toBe(12 * windowMs)
        expect(record.expires_at.toMillis()).toBeGreaterThan(now)
        expect(record.count).toBe(1)
    })

    it('increments within the transaction and does not write when already limited', async () => {
        adminDb.runTransaction.mockImplementation(async (callback) => callback({
            get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ count: 3 }) }),
            set,
        }))

        await expect(assertRateLimit({
            uid: 'student-1',
            action: 'machine_create',
            limit: 3,
        })).rejects.toMatchObject({
            status: 429,
            code: 'rate_limited',
        })
        expect(set).not.toHaveBeenCalled()
    })
})
