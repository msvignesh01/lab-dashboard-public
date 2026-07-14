import { describe, expect, it } from 'vitest'
import { assertCanViewMachine, canViewMachine, sanitizeMachinePayload } from './machinePolicy.js'

describe('machine policy', () => {
    it('lets active users see active machines only unless they are reviewers', () => {
        const activeMachine = { id: 'active', is_active: true }
        const inactiveMachine = { id: 'inactive', is_active: false }

        expect(canViewMachine({ role: 'student' }, activeMachine)).toBe(true)
        expect(canViewMachine({ role: 'student' }, inactiveMachine)).toBe(false)
        expect(canViewMachine({ role: 'faculty' }, inactiveMachine)).toBe(true)
        expect(canViewMachine({ role: 'admin' }, inactiveMachine)).toBe(true)
    })

    it('continues to sanitize machine writes independently of read access', () => {
        expect(sanitizeMachinePayload({ name: ' Printer ', is_active: false })).toMatchObject({
            name: 'Printer',
            is_active: false,
        })
    })

    it('rejects malformed safety-control booleans instead of coercing them', () => {
        expect(() => sanitizeMachinePayload({ name: 'Printer', is_active: 'false' }))
            .toThrowError(expect.objectContaining({ code: 'invalid_machine_active_state' }))
        expect(() => sanitizeMachinePayload({ name: 'Printer', requires_training: 'false' }))
            .toThrowError(expect.objectContaining({ code: 'invalid_training_requirement' }))
        expect(() => sanitizeMachinePayload([], { partial: true }))
            .toThrowError(expect.objectContaining({ code: 'invalid_machine' }))
    })

    it('hides inactive-machine availability from students without leaking its existence', () => {
        const inactiveMachine = { id: 'inactive', is_active: false }

        expect(() => assertCanViewMachine({ role: 'student' }, inactiveMachine)).toThrow('Machine not found.')
        try {
            assertCanViewMachine({ role: 'student' }, inactiveMachine)
        } catch (error) {
            expect(error.status).toBe(404)
            expect(error.code).toBe('machine_not_found')
        }

        expect(assertCanViewMachine({ role: 'faculty' }, inactiveMachine)).toBe(inactiveMachine)
        expect(assertCanViewMachine({ role: 'admin' }, inactiveMachine)).toBe(inactiveMachine)
    })
})
