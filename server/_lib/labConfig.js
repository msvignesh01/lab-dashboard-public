import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './http.js'
import { parseDateOnlyParts } from './bookingPolicy.js'
import { parseTimeToMinute } from '../../shared/bookingValidation.js'
import { BOOKING_LIMITS } from '../../shared/constants.js'

export const LAB_CONFIG_ID = 'default'
export const LAB_TIMEZONE = 'Asia/Kolkata'
export const LAB_TIMEZONE_OFFSET_MINUTES = 330

export const DEFAULT_LAB_CONFIG = {
    id: LAB_CONFIG_ID,
    timezone: LAB_TIMEZONE,
    timezone_offset_minutes: LAB_TIMEZONE_OFFSET_MINUTES,
    open_time: '09:00:00',
    close_time: '18:00:00',
    active_weekdays: [1, 2, 3, 4, 5, 6],
    max_advance_days: BOOKING_LIMITS.MAX_ADVANCE_DAYS,
    max_duration_hours: BOOKING_LIMITS.MAX_DURATION_HOURS,
    updated_at: null,
    updated_by: null,
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

const pad2 = (value) => String(value).padStart(2, '0')

export const normalizeTime = (value) => {
    if (typeof value !== 'string') return null
    const match = value.trim().match(TIME_PATTERN)
    if (!match) return null
    return `${match[1]}:${match[2]}:00`
}

export const formatMinute = (minute) => {
    const hours = Math.floor(minute / 60)
    const minutes = minute % 60
    return `${pad2(hours)}:${pad2(minutes)}:00`
}

export const normalizeLabConfig = (data = {}) => {
    const openTime = normalizeTime(data.open_time) || DEFAULT_LAB_CONFIG.open_time
    const closeTime = normalizeTime(data.close_time) || DEFAULT_LAB_CONFIG.close_time
    const openMinute = parseTimeToMinute(openTime)
    const closeMinute = parseTimeToMinute(closeTime)

    return {
        ...DEFAULT_LAB_CONFIG,
        ...data,
        id: LAB_CONFIG_ID,
        timezone: LAB_TIMEZONE,
        timezone_offset_minutes: LAB_TIMEZONE_OFFSET_MINUTES,
        open_time: openMinute < closeMinute ? openTime : DEFAULT_LAB_CONFIG.open_time,
        close_time: openMinute < closeMinute ? closeTime : DEFAULT_LAB_CONFIG.close_time,
        active_weekdays: Array.isArray(data.active_weekdays)
            ? [...new Set(data.active_weekdays.map(Number).filter((day) => day >= 0 && day <= 6))].sort()
            : DEFAULT_LAB_CONFIG.active_weekdays,
        max_advance_days: Number.isInteger(data.max_advance_days) && data.max_advance_days > 0 && data.max_advance_days <= 90
            ? data.max_advance_days
            : DEFAULT_LAB_CONFIG.max_advance_days,
        max_duration_hours: Number.isInteger(data.max_duration_hours)
            && data.max_duration_hours > 0
            && data.max_duration_hours <= BOOKING_LIMITS.MAX_DURATION_HOURS
            ? data.max_duration_hours
            : DEFAULT_LAB_CONFIG.max_duration_hours,
    }
}

export const getLabConfigRef = () => adminDb.collection('lab_config').doc(LAB_CONFIG_ID)

export const getLabConfig = async (transaction = null) => {
    const ref = getLabConfigRef()
    const snap = transaction ? await transaction.get(ref) : await ref.get()
    return normalizeLabConfig(snap.exists ? snap.data() : DEFAULT_LAB_CONFIG)
}

export const sanitizeLabConfigPayload = (payload, currentConfig, actorUid) => {
    if (!payload || typeof payload !== 'object') {
        throw new ApiError(400, 'Invalid lab configuration.', 'invalid_lab_config')
    }

    const openTime = normalizeTime(payload.open_time ?? currentConfig.open_time)
    const closeTime = normalizeTime(payload.close_time ?? currentConfig.close_time)
    if (!openTime || !closeTime || parseTimeToMinute(openTime) >= parseTimeToMinute(closeTime)) {
        throw new ApiError(400, 'Lab opening hours are invalid.', 'invalid_lab_hours')
    }

    const activeWeekdays = Array.isArray(payload.active_weekdays)
        ? [...new Set(payload.active_weekdays.map(Number).filter((day) => day >= 0 && day <= 6))].sort()
        : currentConfig.active_weekdays

    if (activeWeekdays.length === 0) {
        throw new ApiError(400, 'At least one active weekday is required.', 'invalid_lab_weekdays')
    }

    const maxAdvanceDays = payload.max_advance_days === undefined
        ? currentConfig.max_advance_days
        : Number(payload.max_advance_days)
    const maxDurationHours = payload.max_duration_hours === undefined
        ? currentConfig.max_duration_hours
        : Number(payload.max_duration_hours)

    if (!Number.isInteger(maxAdvanceDays) || maxAdvanceDays < 1 || maxAdvanceDays > 90) {
        throw new ApiError(400, 'Advance booking limit must be between 1 and 90 days.', 'invalid_advance_limit')
    }

    if (
        !Number.isInteger(maxDurationHours)
        || maxDurationHours < 1
        || maxDurationHours > BOOKING_LIMITS.MAX_DURATION_HOURS
    ) {
        throw new ApiError(
            400,
            `Booking duration limit must be between 1 and ${BOOKING_LIMITS.MAX_DURATION_HOURS} hours.`,
            'invalid_duration_limit',
        )
    }

    return normalizeLabConfig({
        open_time: openTime,
        close_time: closeTime,
        active_weekdays: activeWeekdays,
        max_advance_days: maxAdvanceDays,
        max_duration_hours: maxDurationHours,
        updated_at: new Date().toISOString(),
        updated_by: actorUid,
    })
}

export const getWeekday = (dateString) => {
    const parts = parseDateOnlyParts(dateString)
    if (!parts) return null
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
}

export const assertWithinLabHours = (booking, config) => {
    const weekday = getWeekday(booking.booking_date)
    if (!config.active_weekdays.includes(weekday)) {
        throw new ApiError(400, 'The lab is closed on the selected date.', 'lab_closed')
    }

    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)
    const openMinute = parseTimeToMinute(config.open_time)
    const closeMinute = parseTimeToMinute(config.close_time)

    if (startMinute < openMinute || endMinute > closeMinute) {
        throw new ApiError(400, 'Booking time must be within lab operating hours.', 'outside_lab_hours')
    }
}

export const getLabDayRange = (dateString, offsetMinutes = LAB_TIMEZONE_OFFSET_MINUTES) => {
    const parts = parseDateOnlyParts(dateString)
    if (!parts) return null
    const startMs = Date.UTC(parts.year, parts.month - 1, parts.day) - offsetMinutes * 60 * 1000
    const endMs = startMs + 24 * 60 * 60 * 1000
    return {
        start: new Date(startMs),
        end: new Date(endMs),
    }
}
