import { BOOKING_LIMITS } from './constants.js'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

export const toLocalDateString = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export const addDaysToLocalDateString = (date, days) => {
    const next = new Date(date)
    next.setHours(0, 0, 0, 0)
    next.setDate(next.getDate() + days)
    return toLocalDateString(next)
}

export const parseDateOnlyToLocalDate = (value) => {
    if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day)
}

export const parseTimeToMinute = (time) => {
    if (typeof time !== 'string') return Number.NaN
    const match = time.match(TIME_PATTERN)
    if (!match) return Number.NaN

    const hours = Number(match[1])
    const minutes = Number(match[2])
    return hours * 60 + minutes
}

export const validateBookingWindow = (booking, { now = new Date() } = {}) => {
    if (!booking || typeof booking !== 'object') {
        return { valid: false, message: 'Invalid booking data' }
    }

    if (!DATE_ONLY_PATTERN.test(String(booking.booking_date || ''))) {
        return { valid: false, message: 'Invalid booking date' }
    }

    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)

    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute)) {
        return { valid: false, message: 'Invalid booking time' }
    }

    if (startMinute >= endMinute) {
        return { valid: false, message: 'End time must be after start time' }
    }

    const today = toLocalDateString(now)
    if (booking.booking_date < today) {
        return { valid: false, message: 'Cannot book for past dates' }
    }

    if (booking.booking_date === today) {
        const currentMinute = now.getHours() * 60 + now.getMinutes()
        if (startMinute <= currentMinute) {
            return { valid: false, message: 'Cannot book a time slot that has already passed' }
        }
    }

    const maxAdvanceDate = addDaysToLocalDateString(now, BOOKING_LIMITS.MAX_ADVANCE_DAYS)
    if (booking.booking_date > maxAdvanceDate) {
        return { valid: false, message: `Cannot book more than ${BOOKING_LIMITS.MAX_ADVANCE_DAYS} days in advance` }
    }

    const durationHours = (endMinute - startMinute) / 60
    if (durationHours > BOOKING_LIMITS.MAX_DURATION_HOURS) {
        return { valid: false, message: `Booking duration cannot exceed ${BOOKING_LIMITS.MAX_DURATION_HOURS} hours` }
    }

    return { valid: true, message: '' }
}
