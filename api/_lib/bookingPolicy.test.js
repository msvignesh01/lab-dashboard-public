import { describe, expect, it } from 'vitest'
import { ApiError } from './http'
import { getSlotId, getSlotMinutes, validateBookingPayload } from './bookingPolicy'

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

    it('generates deterministic minute slot IDs', () => {
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
})
