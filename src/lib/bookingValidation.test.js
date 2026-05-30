import { describe, expect, it } from 'vitest'
import { parseDateOnlyToLocalDate, parseTimeToMinute, toLocalDateString, validateBookingWindow } from './bookingValidation'

const fixedNow = new Date(2026, 4, 3, 10, 30, 0)
const today = toLocalDateString(fixedNow)

const baseBooking = {
    booking_date: today,
    start_time: '11:00:00',
    end_time: '12:00:00',
}

describe('parseTimeToMinute', () => {
    it('accepts HH:mm and HH:mm:ss values', () => {
        expect(parseTimeToMinute('09:15')).toBe(555)
        expect(parseTimeToMinute('18:30:00')).toBe(1110)
    })

    it('rejects malformed or out-of-range values', () => {
        expect(Number.isNaN(parseTimeToMinute('24:00'))).toBe(true)
        expect(Number.isNaN(parseTimeToMinute('09:99'))).toBe(true)
        expect(Number.isNaN(parseTimeToMinute('9:00'))).toBe(true)
    })
})

describe('parseDateOnlyToLocalDate', () => {
    it('creates a local calendar date instead of a UTC-shifted instant', () => {
        const parsed = parseDateOnlyToLocalDate('2026-05-03')

        expect(parsed).toBeInstanceOf(Date)
        expect(parsed.getFullYear()).toBe(2026)
        expect(parsed.getMonth()).toBe(4)
        expect(parsed.getDate()).toBe(3)
    })

    it('rejects malformed date-only values', () => {
        expect(parseDateOnlyToLocalDate('2026/05/03')).toBeNull()
        expect(parseDateOnlyToLocalDate('not-a-date')).toBeNull()
    })
})

describe('validateBookingWindow', () => {
    it('accepts a valid future booking window', () => {
        expect(validateBookingWindow(baseBooking, { now: fixedNow })).toEqual({ valid: true, message: '' })
    })

    it('rejects same-day bookings that already started', () => {
        const result = validateBookingWindow({
            ...baseBooking,
            start_time: '10:00:00',
            end_time: '11:00:00',
        }, { now: fixedNow })

        expect(result.valid).toBe(false)
        expect(result.message).toMatch(/already passed/i)
    })

    it('rejects past dates', () => {
        const result = validateBookingWindow({
            ...baseBooking,
            booking_date: '2026-05-02',
        }, { now: fixedNow })

        expect(result.valid).toBe(false)
        expect(result.message).toMatch(/past dates/i)
    })

    it('rejects bookings more than 30 days ahead', () => {
        const result = validateBookingWindow({
            ...baseBooking,
            booking_date: '2026-06-03',
        }, { now: fixedNow })

        expect(result.valid).toBe(false)
        expect(result.message).toMatch(/30 days/i)
    })

    it('rejects invalid ordering and excessive duration', () => {
        expect(validateBookingWindow({
            ...baseBooking,
            start_time: '12:00:00',
            end_time: '11:00:00',
        }, { now: fixedNow }).message).toMatch(/after start/i)

        expect(validateBookingWindow({
            ...baseBooking,
            start_time: '11:00:00',
            end_time: '20:01:00',
        }, { now: fixedNow }).message).toMatch(/8 hours/i)
    })
})
