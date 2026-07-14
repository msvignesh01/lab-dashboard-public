import { BOOKING_LIMITS } from '../../shared/constants.js'
import { parseTimeToMinute } from '../../shared/bookingValidation.js'
import { isValidFirestoreId } from './ids.js'
import { ApiError } from './http.js'

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LAB_TIMEZONE_OFFSET_MINUTES = 330
const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'approved'])

export const BOOKING_LOCK_SCHEMA_VERSION = 2
export const BOOKING_LOCK_BUCKET_MINUTES = BOOKING_LIMITS.LOCK_BUCKET_MINUTES
export const MAX_DAILY_BOOKING_LOCK_BUCKETS = Math.ceil(24 * 60 / BOOKING_LOCK_BUCKET_MINUTES)
export const MAX_BOOKING_LOCK_BUCKETS = Math.ceil(
    BOOKING_LIMITS.MAX_DURATION_HOURS * 60 / BOOKING_LOCK_BUCKET_MINUTES,
) + 1

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

// Version 1 used one document per minute. Version 2 uses deterministic 15-minute
// bucket documents, with exact booking intervals stored inside each bucket. The
// interval check avoids both missed overlaps and false conflicts for unaligned
// start/end times while keeping an eight-hour booking below 40 lock documents.
export const getBookingLockBuckets = (booking) => {
    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)

    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute >= endMinute) {
        return []
    }

    const firstBucket = Math.floor(startMinute / BOOKING_LOCK_BUCKET_MINUTES) * BOOKING_LOCK_BUCKET_MINUTES
    const lastBucket = Math.floor((endMinute - 1) / BOOKING_LOCK_BUCKET_MINUTES) * BOOKING_LOCK_BUCKET_MINUTES
    const buckets = []
    for (let minute = firstBucket; minute <= lastBucket; minute += BOOKING_LOCK_BUCKET_MINUTES) {
        buckets.push(minute)
    }
    return buckets
}

export const getBookingLockId = (booking, bucketMinute) => {
    return `${booking.machine_id}_${booking.booking_date}_bucket_${formatSlotMinute(bucketMinute)}`
}

export const buildBookingLockReservation = (booking, status = booking.status) => ({
    booking_id: booking.id,
    student_id: booking.student_id,
    start_minute: parseTimeToMinute(booking.start_time),
    end_minute: parseTimeToMinute(booking.end_time),
    status,
    created_at: booking.created_at,
    updated_at: booking.updated_at,
})

export const buildBookingLockPatch = (booking, bucketMinute, status = booking.status) => ({
    schema_version: BOOKING_LOCK_SCHEMA_VERSION,
    id: getBookingLockId(booking, bucketMinute),
    machine_id: booking.machine_id,
    booking_date: booking.booking_date,
    bucket_start_minute: bucketMinute,
    bucket_end_minute: bucketMinute + BOOKING_LOCK_BUCKET_MINUTES,
    reservations: {
        [booking.id]: buildBookingLockReservation(booking, status),
    },
    updated_at: booking.updated_at,
})

export const buildBookingLockReleasePatch = (booking, bucketMinute, deleteValue, updatedAt) => ({
    schema_version: BOOKING_LOCK_SCHEMA_VERSION,
    id: getBookingLockId(booking, bucketMinute),
    machine_id: booking.machine_id,
    booking_date: booking.booking_date,
    bucket_start_minute: bucketMinute,
    bucket_end_minute: bucketMinute + BOOKING_LOCK_BUCKET_MINUTES,
    reservations: {
        [booking.id]: deleteValue,
    },
    updated_at: updatedAt,
})

export const validateBookingPayload = (payload, { uid, now = new Date(), limits = BOOKING_LIMITS }) => {
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
    const maxAdvanceDays = Number.isInteger(limits.max_advance_days)
        ? limits.max_advance_days
        : BOOKING_LIMITS.MAX_ADVANCE_DAYS
    const maxDurationHours = Number.isInteger(limits.max_duration_hours)
        ? limits.max_duration_hours
        : BOOKING_LIMITS.MAX_DURATION_HOURS
    const maxAdvanceDate = addDaysToDateString(today, maxAdvanceDays)
    if (bookingDate < today) {
        throw new ApiError(400, 'Cannot book for past dates.', 'booking_in_past')
    }
    if (bookingDate > maxAdvanceDate) {
        throw new ApiError(400, `Cannot book more than ${maxAdvanceDays} days in advance.`, 'booking_too_far_ahead')
    }

    const bookingStartMs = getBookingStartMs({ booking_date: bookingDate, start_time: startTime })
    if (!Number.isFinite(bookingStartMs) || bookingStartMs <= now.getTime()) {
        throw new ApiError(400, 'Cannot book a time slot that has already passed.', 'booking_time_passed')
    }

    const durationHours = (endMinute - startMinute) / 60
    if (durationHours > maxDurationHours) {
        throw new ApiError(400, `Booking duration cannot exceed ${maxDurationHours} hours.`, 'booking_too_long')
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
