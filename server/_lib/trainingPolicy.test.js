import { describe, expect, it } from 'vitest'
import { ApiError } from './http.js'
import { assertValidTrainingTargets, parseTrainingStatus } from './trainingPolicy.js'

const machine = { id: 'machine-1', is_active: true }
const student = { id: 'student-1', role: 'student' }

describe('training target policy', () => {
    it('accepts only explicit training status values', () => {
        expect(parseTrainingStatus('active')).toBe('active')
        expect(parseTrainingStatus(' revoked ')).toBe('revoked')
        for (const value of [undefined, null, '', 'approved', 'ACTIVE', true]) {
            expect(() => parseTrainingStatus(value))
                .toThrowError(expect.objectContaining({ code: 'invalid_training_status' }))
        }
    })

    it('accepts an existing student and machine', () => {
        expect(() => assertValidTrainingTargets({ studentProfile: student, machine })).not.toThrow()
    })

    it('rejects missing and non-student profiles', () => {
        expect(() => assertValidTrainingTargets({ studentProfile: null, machine })).toThrow(ApiError)
        expect(() => assertValidTrainingTargets({
            studentProfile: { id: 'faculty-1', role: 'faculty' },
            machine,
        })).toThrow(/only be assigned to students/i)
    })

    it('rejects nonexistent machines', () => {
        expect(() => assertValidTrainingTargets({ studentProfile: student, machine: null })).toThrow(/Machine not found/i)
    })
})
