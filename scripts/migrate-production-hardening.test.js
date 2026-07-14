import { describe, expect, it, vi } from 'vitest'
import {
    buildDocumentIdMismatchWarning,
    hasActiveBookingLock,
    lockDocumentContainsBooking,
} from './migrate-production-hardening.js'
import { getSlotId, getSlotMinutes } from '../server/_lib/bookingPolicy.js'

const booking = {
    id: 'booking-1',
    machine_id: 'machine-1',
    student_id: 'student-1',
    booking_date: '2026-07-15',
    start_time: '10:07:00',
    end_time: '10:22:00',
    status: 'approved',
}

const createFirestore = ({ lockSnapshots, legacyDocs = [] }) => {
    const doc = vi.fn((id) => ({ id }))
    const legacyGet = vi.fn().mockResolvedValue({
        docs: legacyDocs,
        empty: legacyDocs.length === 0,
    })
    const where = vi.fn(() => ({ get: legacyGet }))
    const collection = vi.fn(() => ({ doc, where }))
    const getAll = vi.fn().mockResolvedValue(lockSnapshots)

    return {
        firestore: { collection, getAll },
        spies: { collection, doc, getAll, where, legacyGet },
    }
}

describe('production hardening booking-lock audit', () => {
    it('reports stored booking IDs that conflict with the authoritative document name', () => {
        const snapshot = {
            id: booking.id,
            data: () => ({ id: 'wrong-booking-id' }),
        }

        expect(buildDocumentIdMismatchWarning(snapshot, 'booking')).toEqual({
            type: 'booking_document_id_mismatch',
            bookingId: booking.id,
        })
        expect(buildDocumentIdMismatchWarning({
            ...snapshot,
            data: () => ({ id: booking.id }),
        }, 'booking')).toBeNull()
    })

    it('recognizes a version-2 reservation stored under the booking ID', async () => {
        const lockSnapshots = [
            {
                exists: true,
                data: () => ({
                    schema_version: 2,
                    reservations: {
                        [booking.id]: {
                            booking_id: booking.id,
                            status: 'approved',
                        },
                    },
                }),
            },
            {
                exists: true,
                data: () => ({
                    schema_version: 2,
                    reservations: {
                        [booking.id]: {
                            booking_id: booking.id,
                            status: 'approved',
                        },
                    },
                }),
            },
        ]
        const { firestore, spies } = createFirestore({ lockSnapshots })

        await expect(hasActiveBookingLock({ firestore, booking })).resolves.toBe(true)

        expect(spies.doc).toHaveBeenNthCalledWith(
            1,
            'machine-1_2026-07-15_bucket_1000',
        )
        expect(spies.doc).toHaveBeenNthCalledWith(
            2,
            'machine-1_2026-07-15_bucket_1015',
        )
        expect(spies.getAll).toHaveBeenCalledTimes(1)
        expect(spies.legacyGet).not.toHaveBeenCalled()
    })

    it('accepts a legacy version-1 lock when no version-2 reservation exists', async () => {
        const { firestore, spies } = createFirestore({
            lockSnapshots: [
                { exists: false, data: () => null },
                { exists: false, data: () => null },
            ],
            legacyDocs: getSlotMinutes(booking).map((minute) => ({
                id: getSlotId(booking, minute),
                data: () => ({ booking_id: booking.id }),
            })),
        })

        await expect(hasActiveBookingLock({ firestore, booking })).resolves.toBe(true)

        expect(spies.where).toHaveBeenCalledWith('booking_id', '==', booking.id)
        expect(spies.legacyGet).toHaveBeenCalledTimes(1)
    })

    it('rejects an incomplete legacy version-1 minute-lock set', async () => {
        const legacyMinutes = getSlotMinutes(booking)
        const { firestore } = createFirestore({
            lockSnapshots: [
                { exists: false, data: () => null },
                { exists: false, data: () => null },
            ],
            legacyDocs: legacyMinutes.slice(0, -1).map((minute) => ({
                id: getSlotId(booking, minute),
                data: () => ({ booking_id: booking.id }),
            })),
        })

        await expect(hasActiveBookingLock({ firestore, booking })).resolves.toBe(false)
    })

    it('reports a partial version-2 bucket set even when legacy data exists', async () => {
        const { firestore, spies } = createFirestore({
            lockSnapshots: [
                {
                    exists: true,
                    data: () => ({
                        schema_version: 2,
                        reservations: {
                            [booking.id]: { booking_id: booking.id },
                        },
                    }),
                },
                { exists: false, data: () => null },
            ],
            legacyDocs: [{
                id: 'machine-1_2026-07-15_0607',
                data: () => ({ booking_id: booking.id }),
            }],
        })

        await expect(hasActiveBookingLock({ firestore, booking })).resolves.toBe(false)
        expect(spies.legacyGet).not.toHaveBeenCalled()
    })

    it('reports no lock for unrelated or internally inconsistent reservations', async () => {
        const { firestore } = createFirestore({
            lockSnapshots: [
                {
                    exists: true,
                    data: () => ({
                        schema_version: 2,
                        reservations: {
                            'booking-2': { booking_id: 'booking-2' },
                        },
                    }),
                },
                {
                    exists: true,
                    data: () => ({
                        schema_version: 2,
                        reservations: {
                            [booking.id]: { booking_id: 'booking-2' },
                        },
                    }),
                },
            ],
        })

        await expect(hasActiveBookingLock({ firestore, booking })).resolves.toBe(false)
        expect(lockDocumentContainsBooking({ booking_id: booking.id }, booking.id)).toBe(true)
        expect(lockDocumentContainsBooking({
            schema_version: 2,
            reservations: { [booking.id]: { booking_id: booking.id } },
        }, booking.id)).toBe(true)
    })
})
