import { describe, expect, it, vi } from 'vitest'

vi.mock('./firebaseAdmin.js', () => ({
    adminDb: {
        collection: vi.fn(),
    },
}))

import { BOOKING_LIMITS } from '../../shared/constants.js'
import {
    DEFAULT_LAB_CONFIG,
    normalizeLabConfig,
    sanitizeLabConfigPayload,
} from './labConfig.js'

describe('lab configuration duration policy', () => {
    it('normalizes stored duration limits above the slot-lock ceiling', () => {
        expect(normalizeLabConfig({ max_duration_hours: 9 }).max_duration_hours)
            .toBe(BOOKING_LIMITS.MAX_DURATION_HOURS)
    })

    it('accepts 8 hours and rejects values above 8', () => {
        expect(sanitizeLabConfigPayload({
            max_duration_hours: 8,
        }, DEFAULT_LAB_CONFIG, 'admin-1').max_duration_hours).toBe(8)

        expect(() => sanitizeLabConfigPayload({
            max_duration_hours: 9,
        }, DEFAULT_LAB_CONFIG, 'admin-1')).toThrow(/between 1 and 8 hours/i)
    })
})
