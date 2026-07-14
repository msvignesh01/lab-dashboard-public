import { describe, expect, it } from 'vitest'
import { ApiError } from './http'
import {
    getBookingLockBuckets,
    getBookingLockId,
    getSlotId,
    getSlotMinutes,
    MAX_BOOKING_LOCK_BUCKETS,
    validateBookingPayload,
} from './bookingPolicy'

const fixedNow = new Date('2026-05-03T05:00:00.000Z') // 10:30 in India

const validPayload = {
    machine_id: 'machine-1',
    booking_date: '2026-05-03',
    start_time: '11:00',
    end_time: '12:00',
    purpose: 'Course project print',
}

describe('server booking policy', () => {
    it('normalizes valid booking payloads to the authenticated user', () => {
        const result = validateBookingPayload(validPayload, { uid: 'student-1', now: fixedNow })

        expect(result).toMatchObject({
            student_id: 'student-1',
            start_time: '11:00:00',
            end_time: '12:00:00',
            status: 'pending',
        })
    })

    it('rejects invalid or stale booking windows', () => {
        expect(() => validateBookingPayload({
            ...validPayload,
            start_time: '10:00',
            end_time: '11:00',
        }, { uid: 'student-1', now: fixedNow })).toThrow(ApiError)

        expect(() => validateBookingPayload({
            ...validPayload,
            booking_date: '2026-06-04',
        }, { uid: 'student-1', now: fixedNow })).toThrow(/30 days/)
    })

    it('honors server-configured booking limits', () => {
        expect(() => validateBookingPayload({
            ...validPayload,
            start_time: '11:00',
            end_time: '19:00',
        }, {
            uid: 'student-1',
            now: fixedNow,
            limits: { max_duration_hours: 8, max_advance_days: 30 },
        })).not.toThrow()

        expect(() => validateBookingPayload({
            ...validPayload,
            start_time: '11:00',
            end_time: '14:30',
        }, {
            uid: 'student-1',
            now: fixedNow,
            limits: { max_duration_hours: 3, max_advance_days: 30 },
        })).toThrow(/3 hours/)

        expect(() => validateBookingPayload({
            ...validPayload,
            booking_date: '2026-05-09',
        }, {
            uid: 'student-1',
            now: fixedNow,
            limits: { max_duration_hours: 8, max_advance_days: 5 },
        })).toThrow(/5 days/)
    })

    it('retains deterministic legacy minute slot helpers for migration tooling', () => {
        const booking = {
            id: 'booking-1',
            machine_id: 'machine-1',
            booking_date: '2026-05-03',
            start_time: '11:00:00',
            end_time: '11:03:00',
        }

        expect(getSlotMinutes(booking)).toEqual([660, 661, 662])
        expect(getSlotId(booking, 660)).toBe('machine-1_2026-05-03_1100')
    })

    it('covers the full eight-hour maximum with a bounded number of 15-minute lock documents', () => {
        const aligned = {
            id: 'booking-1',
            machine_id: 'machine-1',
            booking_date: '2026-05-04',
            start_time: '09:00:00',
            end_time: '17:00:00',
        }
        const unaligned = { ...aligned, start_time: '09:07:00', end_time: '17:07:00' }

        expect(getBookingLockBuckets(aligned)).toHaveLength(32)
        expect(getBookingLockBuckets(unaligned)).toHaveLength(33)
        expect(getBookingLockBuckets(unaligned).length).toBeLessThanOrEqual(MAX_BOOKING_LOCK_BUCKETS)
        expect(getBookingLockId(aligned, 540)).toBe('machine-1_2026-05-04_bucket_0900')
        // Booking + audit + two guards still leaves the transaction far below
        // Firestore's 500-write limit at the maximum allowed duration.
        expect(getBookingLockBuckets(unaligned).length + 4).toBeLessThan(500)
    })
})
