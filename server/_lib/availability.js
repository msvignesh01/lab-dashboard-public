import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './http.js'
import { fromFirestoreDocument } from './firestoreData.js'
import { getLabConfig, getLabDayRange, formatMinute } from './labConfig.js'
import { parseDateOnlyParts } from './bookingPolicy.js'
import { parseTimeToMinute } from '../../shared/bookingValidation.js'

const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'approved'])

const toInterval = (startMinute, endMinute, source, label = '') => ({
    start_minute: startMinute,
    end_minute: endMinute,
    start_time: formatMinute(startMinute),
    end_time: formatMinute(endMinute),
    source,
    label,
})

const mergeIntervals = (intervals) => {
    const sorted = intervals
        .filter((item) => Number.isFinite(item.start_minute) && Number.isFinite(item.end_minute) && item.start_minute < item.end_minute)
        .sort((a, b) => a.start_minute - b.start_minute)

    const merged = []
    for (const interval of sorted) {
        const last = merged[merged.length - 1]
        if (!last || interval.start_minute > last.end_minute) {
            merged.push({ ...interval })
        } else {
            last.end_minute = Math.max(last.end_minute, interval.end_minute)
            last.end_time = formatMinute(last.end_minute)
            last.label = last.label || interval.label
        }
    }
    return merged
}

const subtractIntervals = (baseIntervals, blockedIntervals) => {
    let available = baseIntervals.map((item) => ({ ...item }))

    for (const blocked of mergeIntervals(blockedIntervals)) {
        const next = []
        for (const current of available) {
            if (blocked.end_minute <= current.start_minute || blocked.start_minute >= current.end_minute) {
                next.push(current)
                continue
            }

            if (blocked.start_minute > current.start_minute) {
                next.push(toInterval(current.start_minute, blocked.start_minute, 'available'))
            }
            if (blocked.end_minute < current.end_minute) {
                next.push(toInterval(blocked.end_minute, current.end_minute, 'available'))
            }
        }
        available = next
    }

    return available
}

const isoToMinuteOnDate = (isoValue, dateString, offsetMinutes) => {
    const date = new Date(isoValue)
    if (Number.isNaN(date.getTime())) return null
    const shifted = new Date(date.getTime() + offsetMinutes * 60 * 1000)
    const shiftedDate = shifted.toISOString().slice(0, 10)
    const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()

    if (shiftedDate < dateString) return 0
    if (shiftedDate > dateString) return 24 * 60
    return minute
}

export const getTrainingRecordId = (studentId, machineId) => `${studentId}_${machineId}`

export const hasActiveTraining = (record) => {
    return record?.status === 'active' && !record.revoked_at
}

export const getAvailabilityForMachine = async ({ machineId, dateString, studentId = null }) => {
    if (!parseDateOnlyParts(dateString)) {
        throw new ApiError(400, 'Invalid availability date.', 'invalid_date')
    }

    const machineSnap = await adminDb.collection('machines').doc(machineId).get()
    if (!machineSnap.exists) {
        throw new ApiError(404, 'Machine not found.', 'machine_not_found')
    }

    const machine = fromFirestoreDocument(machineSnap)
    const config = await getLabConfig()
    const range = getLabDayRange(dateString, config.timezone_offset_minutes)

    const bookingsSnap = await adminDb
        .collection('bookings')
        .where('machine_id', '==', machineId)
        .where('booking_date', '==', dateString)
        .get()

    const bookingIntervals = bookingsSnap.docs
        .map(fromFirestoreDocument)
        .filter((booking) => ACTIVE_BOOKING_STATUSES.has(booking.status))
        .map((booking) => toInterval(
            parseTimeToMinute(booking.start_time),
            parseTimeToMinute(booking.end_time),
            'booking',
            booking.status,
        ))

    const maintenanceSnap = await adminDb
        .collection('maintenance_windows')
        .where('status', '==', 'active')
        .get()

    const maintenanceIntervals = maintenanceSnap.docs
        .map(fromFirestoreDocument)
        .filter((item) => item.machine_id === machineId || item.scope === 'global' || !item.machine_id)
        .filter((item) => {
            const start = new Date(item.start_at)
            const end = new Date(item.end_at)
            return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && start < range.end && end > range.start
        })
        .map((item) => toInterval(
            isoToMinuteOnDate(item.start_at, dateString, config.timezone_offset_minutes),
            isoToMinuteOnDate(item.end_at, dateString, config.timezone_offset_minutes),
            'maintenance',
            item.reason || 'Maintenance',
        ))

    let trainingRecord = null
    if (studentId && machine.requires_training) {
        const trainingSnap = await adminDb.collection('training_records').doc(getTrainingRecordId(studentId, machineId)).get()
        trainingRecord = trainingSnap.exists ? fromFirestoreDocument(trainingSnap) : null
    }

    const isOpenDay = config.active_weekdays.includes(new Date(Date.UTC(
        Number(dateString.slice(0, 4)),
        Number(dateString.slice(5, 7)) - 1,
        Number(dateString.slice(8, 10)),
    )).getUTCDay())

    const baseIntervals = isOpenDay && machine.is_active === true
        ? [toInterval(parseTimeToMinute(config.open_time), parseTimeToMinute(config.close_time), 'lab_hours')]
        : []

    const blockedIntervals = mergeIntervals([...bookingIntervals, ...maintenanceIntervals])
    const availableIntervals = subtractIntervals(baseIntervals, blockedIntervals)
    const eligible = !machine.requires_training || hasActiveTraining(trainingRecord)

    return {
        machine: {
            id: machine.id,
            name: machine.name || '',
            is_active: machine.is_active === true,
            requires_training: machine.requires_training === true,
        },
        date: dateString,
        lab_config: config,
        eligible,
        training_record: trainingRecord,
        blocked_intervals: blockedIntervals,
        available_intervals: eligible ? availableIntervals : [],
        booking_intervals: bookingIntervals,
        maintenance_intervals: maintenanceIntervals,
    }
}

export const assertNoMaintenanceConflict = async (booking) => {
    const availability = await getAvailabilityForMachine({
        machineId: booking.machine_id,
        dateString: booking.booking_date,
        studentId: booking.student_id,
    })

    if (!availability.machine.is_active) {
        throw new ApiError(409, 'Selected machine is not available for booking.', 'machine_unavailable')
    }

    if (!availability.eligible) {
        throw new ApiError(403, 'Training approval is required before booking this machine.', 'training_required')
    }

    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)
    const hasOpenSlot = availability.available_intervals.some((interval) => (
        startMinute >= interval.start_minute && endMinute <= interval.end_minute
    ))

    if (!hasOpenSlot) {
        throw new ApiError(409, 'This time is not available for the selected machine.', 'slot_unavailable')
    }
}
