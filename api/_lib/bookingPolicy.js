import { BOOKING_LIMITS } from '../../src/lib/constants.js'
import { parseTimeToMinute } from '../../src/lib/bookingValidation.js'
import { isValidFirestoreId } from './ids.js'
import { ApiError } from './http.js'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LAB_TIMEZONE_OFFSET_MINUTES = 330
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'approved'])

const pad2 = (value) => String(value).padStart(2, '0')

export const normalizeTime = (time) => {
    const minute = parseTimeToMinute(time)
    if (!Number.isFinite(minute)) return null
    const hours = Math.floor(minute / 60)
    const minutes = minute % 60
    return `${pad2(hours)}:${pad2(minutes)}:00`
}

export const parseDateOnlyParts = (value) => {
    if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return null
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) {
        return null
    }
    return { year, month, day }
}

export const toLabDateString = (date = new Date()) => {
    const shifted = new Date(date.getTime() + LAB_TIMEZONE_OFFSET_MINUTES * 60 * 1000)
    return shifted.toISOString().slice(0, 10)
}

export const addDaysToDateString = (dateString, days) => {
    const parts = parseDateOnlyParts(dateString)
    if (!parts) return null
    const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}

export const getBookingStartMs = (booking) => {
    const parts = parseDateOnlyParts(booking.booking_date)
    const minute = parseTimeToMinute(booking.start_time)
    if (!parts || !Number.isFinite(minute)) return Number.NaN

    const hours = Math.floor(minute / 60)
    const minutes = minute % 60
    return Date.UTC(parts.year, parts.month - 1, parts.day, hours, minutes)
        - LAB_TIMEZONE_OFFSET_MINUTES * 60 * 1000
}

export const formatSlotMinute = (minute) => {
    const hours = Math.floor(minute / 60).toString().padStart(2, '0')
    const minutes = (minute % 60).toString().padStart(2, '0')
    return `${hours}${minutes}`
}

export const getSlotMinutes = (booking) => {
    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)

    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute >= endMinute) {
        return []
    }

    const minutes = []
    for (let minute = startMinute; minute < endMinute; minute += 1) {
        minutes.push(minute)
    }
    return minutes
}

export const getSlotId = (booking, minute) => {
    return `${booking.machine_id}_${booking.booking_date}_${formatSlotMinute(minute)}`
}

export const buildSlotRecord = (booking, slotId, minute, status = booking.status) => ({
    id: slotId,
    booking_id: booking.id,
    machine_id: booking.machine_id,
    booking_date: booking.booking_date,
    minute,
    student_id: booking.student_id,
    status,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
})

export const validateBookingPayload = (payload, { uid, now = new Date() }) => {
    if (!payload || typeof payload !== 'object') {
        throw new ApiError(400, 'Invalid booking data.', 'invalid_booking')
    }

    const machineId = typeof payload.machine_id === 'string' ? payload.machine_id.trim() : ''
    if (!isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Invalid machine ID.', 'invalid_machine_id')
    }

    const bookingDate = typeof payload.booking_date === 'string' ? payload.booking_date.trim() : ''
    if (!parseDateOnlyParts(bookingDate)) {
        throw new ApiError(400, 'Invalid booking date.', 'invalid_booking_date')
    }

    const startTime = normalizeTime(payload.start_time)
    const endTime = normalizeTime(payload.end_time)
    if (!startTime || !endTime) {
        throw new ApiError(400, 'Invalid booking time.', 'invalid_booking_time')
    }

    const startMinute = parseTimeToMinute(startTime)
    const endMinute = parseTimeToMinute(endTime)
    if (startMinute >= endMinute) {
        throw new ApiError(400, 'End time must be after start time.', 'invalid_booking_window')
    }

    const today = toLabDateString(now)
    const maxAdvanceDate = addDaysToDateString(today, BOOKING_LIMITS.MAX_ADVANCE_DAYS)
    if (bookingDate < today) {
        throw new ApiError(400, 'Cannot book for past dates.', 'booking_in_past')
    }
    if (bookingDate > maxAdvanceDate) {
        throw new ApiError(400, `Cannot book more than ${BOOKING_LIMITS.MAX_ADVANCE_DAYS} days in advance.`, 'booking_too_far_ahead')
    }

    const bookingStartMs = getBookingStartMs({ booking_date: bookingDate, start_time: startTime })
    if (!Number.isFinite(bookingStartMs) || bookingStartMs <= now.getTime()) {
        throw new ApiError(400, 'Cannot book a time slot that has already passed.', 'booking_time_passed')
    }

    const durationHours = (endMinute - startMinute) / 60
    if (durationHours > BOOKING_LIMITS.MAX_DURATION_HOURS) {
        throw new ApiError(400, `Booking duration cannot exceed ${BOOKING_LIMITS.MAX_DURATION_HOURS} hours.`, 'booking_too_long')
    }

    const purpose = typeof payload.purpose === 'string' ? payload.purpose.trim().slice(0, 500) : ''
    if (!purpose) {
        throw new ApiError(400, 'Purpose is required.', 'missing_purpose')
    }

    return {
        machine_id: machineId,
        student_id: uid,
        booking_date: bookingDate,
        start_time: startTime,
        end_time: endTime,
        purpose,
        status: 'pending',
    }
}

export const assertBookingIsFuture = (booking, message = 'This booking can no longer be changed.') => {
    const startMs = getBookingStartMs(booking)
    if (!Number.isFinite(startMs) || startMs <= Date.now()) {
        throw new ApiError(409, message, 'booking_stale')
    }
}

export const isActiveBookingStatus = (status) => ACTIVE_BOOKING_STATUSES.has(status)
