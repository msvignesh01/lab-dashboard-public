import { parseTimeToMinute } from '../../shared/bookingValidation.js'
import { parseDateOnlyParts } from './bookingPolicy.js'
import { ApiError } from './http.js'

const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'approved'])

const getSnapshotData = (snapshot) => {
    if (!snapshot) return null
    if (snapshot.exists === false) return null
    if (typeof snapshot.data === 'function') return snapshot.data()
    return snapshot
}

export const intervalsOverlap = (first, second) => (
    first.start < second.end && second.start < first.end
)

export const getBookingUtcInterval = (booking, timezoneOffsetMinutes = 330) => {
    const parts = parseDateOnlyParts(booking?.booking_date)
    const startMinute = parseTimeToMinute(booking?.start_time)
    const endMinute = parseTimeToMinute(booking?.end_time)
    if (!parts || !Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute >= endMinute) {
        return null
    }

    const dayStart = Date.UTC(parts.year, parts.month - 1, parts.day)
        - timezoneOffsetMinutes * 60 * 1000
    return {
        start: dayStart + startMinute * 60 * 1000,
        end: dayStart + endMinute * 60 * 1000,
    }
}

export const getMaintenanceUtcInterval = (maintenance) => {
    const start = new Date(maintenance?.start_at).getTime()
    const end = new Date(maintenance?.end_at).getTime()
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return null
    return { start, end }
}

export const maintenanceAppliesToMachine = (maintenance, machineId) => (
    maintenance?.scope === 'global'
    || !maintenance?.machine_id
    || maintenance.machine_id === machineId
)

export const assertNoActiveMaintenanceConflict = ({
    booking,
    maintenanceWindows = [],
    timezoneOffsetMinutes = 330,
}) => {
    const bookingInterval = getBookingUtcInterval(booking, timezoneOffsetMinutes)
    if (!bookingInterval) {
        throw new ApiError(409, 'Stored booking data is invalid and cannot be safely scheduled.', 'booking_state_invalid')
    }

    for (const maintenance of maintenanceWindows) {
        if (maintenance?.status !== 'active' || !maintenanceAppliesToMachine(maintenance, booking.machine_id)) continue
        const maintenanceInterval = getMaintenanceUtcInterval(maintenance)
        if (!maintenanceInterval) {
            throw new ApiError(409, 'Maintenance data is invalid; scheduling is blocked until it is repaired.', 'maintenance_state_invalid')
        }
        if (intervalsOverlap(bookingInterval, maintenanceInterval)) {
            throw new ApiError(409, 'This booking overlaps an active maintenance window.', 'maintenance_conflict')
        }
    }
}

export const assertNoActiveBookingConflict = ({ booking, bookings = [], ignoreBookingId = null }) => {
    const requestedInterval = getBookingUtcInterval(booking)
    if (!requestedInterval) {
        throw new ApiError(409, 'Stored booking data is invalid and cannot be safely scheduled.', 'booking_state_invalid')
    }

    for (const existing of bookings) {
        if (!ACTIVE_BOOKING_STATUSES.has(existing?.status) || existing?.id === ignoreBookingId) continue
        if (!existing.machine_id) {
            throw new ApiError(409, 'Existing booking data is invalid; scheduling is blocked until it is repaired.', 'booking_state_invalid')
        }
        if (existing.machine_id !== booking.machine_id) continue
        const existingInterval = getBookingUtcInterval(existing)
        if (!existingInterval) {
            throw new ApiError(409, 'Existing booking data is invalid; scheduling is blocked until it is repaired.', 'booking_state_invalid')
        }
        if (intervalsOverlap(requestedInterval, existingInterval)) {
            throw new ApiError(409, 'This booking conflicts with an existing booking.', 'booking_conflict')
        }
    }
}

export const assertBookingLocksAvailable = ({ booking, lockSnapshots = [] }) => {
    const start = parseTimeToMinute(booking?.start_time)
    const end = parseTimeToMinute(booking?.end_time)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new ApiError(409, 'Stored booking data is invalid and cannot be safely scheduled.', 'booking_state_invalid')
    }

    for (const snapshot of lockSnapshots) {
        const lock = getSnapshotData(snapshot)
        if (!lock) continue
        if (lock.schema_version !== 2 || !lock.reservations || typeof lock.reservations !== 'object') {
            throw new ApiError(409, 'Booking lock data is invalid; scheduling is blocked until it is repaired.', 'booking_lock_invalid')
        }

        for (const reservation of Object.values(lock.reservations)) {
            if (!ACTIVE_BOOKING_STATUSES.has(reservation?.status) || reservation?.booking_id === booking.id) continue
            if (
                !Number.isFinite(reservation.start_minute)
                || !Number.isFinite(reservation.end_minute)
                || reservation.start_minute >= reservation.end_minute
            ) {
                throw new ApiError(409, 'Booking lock data is invalid; scheduling is blocked until it is repaired.', 'booking_lock_invalid')
            }
            if (start < reservation.end_minute && reservation.start_minute < end) {
                throw new ApiError(409, 'This booking conflicts with an existing booking.', 'booking_conflict')
            }
        }
    }
}

export const assertBookingApprovalSafety = ({
    booking,
    machine,
    studentProfile,
    trainingRecord = null,
    labConfig,
    maintenanceWindows = [],
    bookings = [],
}) => {
    if (!machine || machine.id !== booking.machine_id || machine.is_active !== true) {
        throw new ApiError(409, 'Selected machine is not available for booking.', 'machine_unavailable')
    }
    if (!studentProfile || studentProfile.role !== 'student' || studentProfile.status !== 'active') {
        throw new ApiError(409, 'The student account is no longer eligible to hold this booking.', 'student_ineligible')
    }

    const parts = parseDateOnlyParts(booking.booking_date)
    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)
    const openMinute = parseTimeToMinute(labConfig?.open_time)
    const closeMinute = parseTimeToMinute(labConfig?.close_time)
    const weekday = parts
        ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
        : null
    if (
        !parts
        || !Number.isFinite(startMinute)
        || !Number.isFinite(endMinute)
        || startMinute >= endMinute
        || !Number.isFinite(openMinute)
        || !Number.isFinite(closeMinute)
        || !Array.isArray(labConfig?.active_weekdays)
        || !labConfig.active_weekdays.includes(weekday)
        || startMinute < openMinute
        || endMinute > closeMinute
    ) {
        throw new ApiError(409, 'The booking is no longer within current lab operating hours.', 'outside_lab_hours')
    }

    const maxDurationHours = Number(labConfig?.max_duration_hours)
    if (!Number.isFinite(maxDurationHours) || (endMinute - startMinute) / 60 > maxDurationHours) {
        throw new ApiError(409, 'The booking exceeds the current duration limit.', 'booking_too_long')
    }

    if (machine.requires_training === true && !(trainingRecord?.status === 'active' && !trainingRecord.revoked_at)) {
        throw new ApiError(403, 'Training approval is required before booking this machine.', 'training_required')
    }

    assertNoActiveMaintenanceConflict({
        booking,
        maintenanceWindows,
        timezoneOffsetMinutes: labConfig.timezone_offset_minutes,
    })
    assertNoActiveBookingConflict({ booking, bookings, ignoreBookingId: booking.id })
}

export const assertMaintenanceHasNoBookingConflict = ({ maintenance, bookings = [], timezoneOffsetMinutes = 330 }) => {
    const maintenanceInterval = getMaintenanceUtcInterval(maintenance)
    if (!maintenanceInterval) {
        throw new ApiError(400, 'Maintenance start and end times are invalid.', 'invalid_maintenance_window')
    }

    for (const booking of bookings) {
        if (!ACTIVE_BOOKING_STATUSES.has(booking?.status)) continue
        if (!booking.machine_id) {
            throw new ApiError(409, 'Existing booking data is invalid; maintenance cannot be scheduled safely.', 'booking_state_invalid')
        }
        if (!maintenanceAppliesToMachine(maintenance, booking.machine_id)) continue
        const bookingInterval = getBookingUtcInterval(booking, timezoneOffsetMinutes)
        if (!bookingInterval) {
            throw new ApiError(409, 'Existing booking data is invalid; maintenance cannot be scheduled safely.', 'booking_state_invalid')
        }
        if (intervalsOverlap(maintenanceInterval, bookingInterval)) {
            throw new ApiError(
                409,
                'Maintenance overlaps a pending or approved booking. Resolve the booking first.',
                'maintenance_booking_conflict',
            )
        }
    }
}

const toLabDate = (milliseconds, timezoneOffsetMinutes) => (
    new Date(milliseconds + timezoneOffsetMinutes * 60 * 1000).toISOString().slice(0, 10)
)

export const getMaintenanceBookingDateBounds = (maintenance, timezoneOffsetMinutes = 330) => {
    const interval = getMaintenanceUtcInterval(maintenance)
    if (!interval) {
        throw new ApiError(400, 'Maintenance start and end times are invalid.', 'invalid_maintenance_window')
    }
    return {
        dateFrom: toLabDate(interval.start, timezoneOffsetMinutes),
        dateTo: toLabDate(interval.end - 1, timezoneOffsetMinutes),
    }
}

export const getScheduleGuardRefs = (db, { machineId = null, scope = 'booking' } = {}) => {
    const collection = db.collection('schedule_guards')
    if (scope === 'global') return [collection.doc('global')]
    if (scope === 'machine') return [collection.doc(`machine_${machineId}`)]
    return [collection.doc('global'), collection.doc(`machine_${machineId}`)]
}

export const transactionGetAll = async (transaction, refs) => {
    if (!Array.isArray(refs) || refs.length === 0) return []
    if (typeof transaction.getAll === 'function') return transaction.getAll(...refs)
    return Promise.all(refs.map((ref) => transaction.get(ref)))
}
