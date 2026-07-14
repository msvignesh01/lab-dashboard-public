import { describe, expect, it } from 'vitest'
import { BOOKING_LIMITS } from './constants.js'
import {
    parseDateOnlyToLocalDate,
    parseTimeToMinute,
    toLocalDateString,
    validateBookingWindow,
} from './bookingValidation.js'

const fixedNow = new Date(2026, 4, 3, 10, 30, 0)
const today = toLocalDateString(fixedNow)

const baseBooking = {
    booking_date: today,
    start_time: '11:00:00',
    end_time: '12:00:00',
}

describe('shared booking validation', () => {
    it('accepts HH:mm and HH:mm:ss and rejects malformed times', () => {
        expect(parseTimeToMinute('09:15')).toBe(555)
        expect(parseTimeToMinute('18:30:00')).toBe(1110)
        expect(Number.isNaN(parseTimeToMinute('24:00'))).toBe(true)
        expect(Number.isNaN(parseTimeToMinute('09:99'))).toBe(true)
    })

    it('parses date-only values as local calendar dates', () => {
        const parsed = parseDateOnlyToLocalDate('2026-05-03')
        expect(parsed).toBeInstanceOf(Date)
        expect(parsed.getFullYear()).toBe(2026)
        expect(parsed.getMonth()).toBe(4)
        expect(parsed.getDate()).toBe(3)
        expect(parseDateOnlyToLocalDate('2026/05/03')).toBeNull()
    })

    it('enforces the shared booking duration ceiling', () => {
        expect(BOOKING_LIMITS.MAX_DURATION_HOURS).toBe(8)
        expect(validateBookingWindow(baseBooking, { now: fixedNow })).toEqual({ valid: true, message: '' })
        expect(validateBookingWindow({
            ...baseBooking,
            start_time: '11:00:00',
            end_time: '19:01:00',
        }, { now: fixedNow }).message).toMatch(/8 hours/i)
    })
})
