import { describe, expect, it, vi } from 'vitest'
import {
    fromFirestoreDocument,
    hasStoredDocumentIdMismatch,
} from './firestoreData.js'

describe('Firestore document identity', () => {
    it('uses the document name when persisted data contains a conflicting booking ID', () => {
        const snapshot = {
            id: 'booking-canonical',
            data: vi.fn(() => ({
                id: 'booking-attacker-controlled',
                machine_id: 'machine-1',
            })),
        }

        expect(fromFirestoreDocument(snapshot)).toEqual({
            id: 'booking-canonical',
            machine_id: 'machine-1',
        })
        expect(hasStoredDocumentIdMismatch(snapshot)).toBe(true)
    })

    it('does not report absent or matching denormalized IDs as conflicts', () => {
        expect(hasStoredDocumentIdMismatch({
            id: 'profile-1',
            data: () => ({ email: 'profile@example.edu' }),
        })).toBe(false)
        expect(hasStoredDocumentIdMismatch({
            id: 'profile-1',
            data: () => ({ id: 'profile-1' }),
        })).toBe(false)
    })
})
