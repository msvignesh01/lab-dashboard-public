import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './http.js'
import {
    assertBookingApprovalSafety,
    assertBookingLocksAvailable,
    assertMaintenanceHasNoBookingConflict,
    assertNoActiveMaintenanceConflict,
    getMaintenanceBookingDateBounds,
    intervalsOverlap,
    transactionGetAll,
} from './schedulePolicy.js'

const booking = {
    id: 'booking-1',
    machine_id: 'machine-1',
    student_id: 'student-1',
    booking_date: '2026-07-20',
    start_time: '10:00:00',
    end_time: '11:00:00',
    status: 'pending',
}

const labConfig = {
    timezone_offset_minutes: 330,
    open_time: '09:00:00',
    close_time: '18:00:00',
    active_weekdays: [1],
    max_duration_hours: 8,
}

const machine = { id: 'machine-1', is_active: true, requires_training: false }
const studentProfile = { id: 'student-1', role: 'student', status: 'active' }

describe('schedule safety policy', () => {
    it('uses half-open interval overlap semantics', () => {
        expect(intervalsOverlap({ start: 1, end: 2 }, { start: 2, end: 3 })).toBe(false)
        expect(intervalsOverlap({ start: 1, end: 3 }, { start: 2, end: 4 })).toBe(true)
    })

    it('revalidates all approval-critical state', () => {
        expect(() => assertBookingApprovalSafety({
            booking,
            machine,
            studentProfile,
            labConfig,
        })).not.toThrow()

        expect(() => assertBookingApprovalSafety({
            booking,
            machine: { ...machine, is_active: false },
            studentProfile,
            labConfig,
        })).toThrowError(expect.objectContaining({ code: 'machine_unavailable' }))

        expect(() => assertBookingApprovalSafety({
            booking,
            machine: { ...machine, requires_training: true },
            studentProfile,
            labConfig,
            trainingRecord: { status: 'revoked' },
        })).toThrowError(expect.objectContaining({ code: 'training_required' }))

        expect(() => assertBookingApprovalSafety({
            booking,
            machine,
            studentProfile,
            labConfig: { ...labConfig, close_time: '10:30:00' },
        })).toThrowError(expect.objectContaining({ code: 'outside_lab_hours' }))
    })

    it('blocks overlapping maintenance and treats adjacent windows as safe', () => {
        const adjacent = {
            status: 'active',
            scope: 'machine',
            machine_id: 'machine-1',
            start_at: '2026-07-20T03:30:00.000Z',
            end_at: '2026-07-20T04:30:00.000Z',
        }
        expect(() => assertNoActiveMaintenanceConflict({
            booking,
            maintenanceWindows: [adjacent],
            timezoneOffsetMinutes: 330,
        })).not.toThrow()

        const overlapping = { ...adjacent, end_at: '2026-07-20T05:00:00.000Z' }
        expect(() => assertNoActiveMaintenanceConflict({
            booking,
            maintenanceWindows: [overlapping],
            timezoneOffsetMinutes: 330,
        })).toThrowError(expect.objectContaining({ code: 'maintenance_conflict' }))
    })

    it('fails closed for malformed active maintenance that applies to the machine', () => {
        expect(() => assertNoActiveMaintenanceConflict({
            booking,
            maintenanceWindows: [{ status: 'active', scope: 'global', start_at: 'bad', end_at: 'bad' }],
        })).toThrowError(expect.objectContaining({ code: 'maintenance_state_invalid' }))
    })

    it('rejects maintenance that intersects pending or approved bookings', () => {
        const maintenance = {
            scope: 'machine',
            machine_id: 'machine-1',
            start_at: '2026-07-20T04:45:00.000Z',
            end_at: '2026-07-20T05:15:00.000Z',
        }
        expect(() => assertMaintenanceHasNoBookingConflict({
            maintenance,
            bookings: [booking],
        })).toThrowError(expect.objectContaining({ code: 'maintenance_booking_conflict' }))
        expect(() => assertMaintenanceHasNoBookingConflict({
            maintenance,
            bookings: [{ ...booking, status: 'cancelled' }],
        })).not.toThrow()
    })

    it('keeps exact interval safety for multiple reservations in one 15-minute bucket', () => {
        const shortBooking = { ...booking, start_time: '10:07:00', end_time: '10:10:00' }
        const adjacentLock = {
            schema_version: 2,
            reservations: {
                other: {
                    booking_id: 'booking-2',
                    start_minute: 610,
                    end_minute: 612,
                    status: 'approved',
                },
            },
        }
        expect(() => assertBookingLocksAvailable({
            booking: shortBooking,
            lockSnapshots: [adjacentLock],
        })).not.toThrow()

        adjacentLock.reservations.other.start_minute = 609
        expect(() => assertBookingLocksAvailable({
            booking: shortBooking,
            lockSnapshots: [adjacentLock],
        })).toThrowError(expect.objectContaining({ code: 'booking_conflict' }))
    })

    it('derives inclusive lab-date bounds for cross-day maintenance', () => {
        expect(getMaintenanceBookingDateBounds({
            start_at: '2026-07-20T17:30:00.000Z',
            end_at: '2026-07-21T19:00:00.000Z',
        }, 330)).toEqual({ dateFrom: '2026-07-20', dateTo: '2026-07-22' })
    })

    it('uses transaction.getAll and has a safe compatibility fallback', async () => {
        const refs = [{ id: 'one' }, { id: 'two' }]
        const getAll = vi.fn().mockResolvedValue(['one', 'two'])
        await expect(transactionGetAll({ getAll }, refs)).resolves.toEqual(['one', 'two'])
        expect(getAll).toHaveBeenCalledWith(...refs)

        const get = vi.fn((ref) => Promise.resolve(ref.id))
        await expect(transactionGetAll({ get }, refs)).resolves.toEqual(['one', 'two'])
        expect(get).toHaveBeenCalledTimes(2)
    })

    it('uses structured API errors for fail-closed conflicts', () => {
        try {
            assertBookingLocksAvailable({ booking, lockSnapshots: [{ schema_version: 1 }] })
            throw new Error('Expected a conflict')
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError)
            expect(error.status).toBe(409)
            expect(error.code).toBe('booking_lock_invalid')
        }
    })
})
