import { describe, expect, it } from 'vitest'
import { getAccountAccessState, hasProfileRole, PROFILE_STATUS } from './authPolicy'

const verifiedUser = { id: 'u1', emailVerified: true }
const unverifiedUser = { id: 'u1', emailVerified: false }

describe('auth policy', () => {
    it('blocks unverified users before profile access', () => {
        expect(getAccountAccessState({ user: unverifiedUser, profile: null })).toBe('email_unverified')
    })

    it('surfaces pending and suspended account states', () => {
        expect(getAccountAccessState({
            user: verifiedUser,
            profile: { status: PROFILE_STATUS.PENDING_APPROVAL, role: 'faculty' },
        })).toBe('pending_approval')

        expect(getAccountAccessState({
            user: verifiedUser,
            profile: { status: PROFILE_STATUS.SUSPENDED, role: 'student' },
        })).toBe('suspended')
    })

    it('requires active profile status for role checks', () => {
        expect(hasProfileRole({ status: PROFILE_STATUS.ACTIVE, role: 'faculty' }, 'student')).toBe(true)
        expect(hasProfileRole({ status: PROFILE_STATUS.ACTIVE, role: 'student' }, 'faculty')).toBe(false)
        expect(hasProfileRole({ status: PROFILE_STATUS.PENDING_APPROVAL, role: 'faculty' }, 'student')).toBe(false)
    })
})
