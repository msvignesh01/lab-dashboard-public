import { describe, expect, it } from 'vitest'
import { ApiError } from './http.js'
import {
    assertAuthorizedProfileIdentity,
    assertIdempotentRegistration,
    buildRegistrationProfile,
    getInstitutionalRole,
    sanitizeOwnProfilePatch,
} from './profilePolicy.js'

const now = '2026-07-15T00:00:00.000Z'
const studentToken = {
    uid: 'student-1',
    email: 'Student.One@btech.christuniversity.in',
    email_verified: false,
}
const studentPayload = {
    uid: 'student-1',
    email: 'student.one@btech.christuniversity.in',
    full_name: 'Student One',
    role: 'student',
    department: 'CSE',
    phone: '+91 98765 43210',
    register_number: '24680135',
    specialization: 'Computer Science and Engineering',
    year_of_passout: '2028',
}

const expectApiError = (callback, code) => {
    try {
        callback()
        throw new Error('Expected policy to reject the payload.')
    } catch (error) {
        expect(error).toBeInstanceOf(ApiError)
        expect(error.code).toBe(code)
    }
}

describe('profile registration policy', () => {
    it('derives all privileged student fields from the verified token and role policy', () => {
        const result = buildRegistrationProfile({
            decodedToken: studentToken,
            payload: studentPayload,
            now,
        })

        expect(result).toMatchObject({
            id: 'student-1',
            email: 'student.one@btech.christuniversity.in',
            role: 'student',
            requested_role: 'student',
            status: 'active',
            approved_by: null,
            email_verified_at: null,
            created_at: now,
            updated_at: now,
        })
    })

    it('creates faculty profiles in pending approval without student-only fields', () => {
        const result = buildRegistrationProfile({
            decodedToken: {
                uid: 'faculty-1',
                email: 'faculty.one@christuniversity.in',
                email_verified: true,
            },
            payload: {
                uid: 'faculty-1',
                email: 'faculty.one@christuniversity.in',
                full_name: 'Faculty One',
                role: 'faculty',
                department: 'ECE',
            },
            now,
        })

        expect(result).toMatchObject({
            role: 'faculty',
            requested_role: 'faculty',
            status: 'pending_approval',
            phone: '',
            register_number: '',
            email_verified_at: now,
        })
    })

    it('rejects UID, email-domain, role, and privileged-field spoofing', () => {
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, uid: 'other-user' },
            now,
        }), 'profile_identity_mismatch')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, email: 'faculty.one@christuniversity.in' },
            now,
        }), 'profile_email_mismatch')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, role: 'faculty' },
            now,
        }), 'profile_role_mismatch')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, status: 'active' },
            now,
        }), 'unsupported_profile_field')
    })

    it('enforces department, student field formats, and bounded text', () => {
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, department: 'Executive Office' },
            now,
        }), 'invalid_department')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, phone: '1234' },
            now,
        }), 'invalid_phone')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, register_number: '../admin' },
            now,
        }), 'invalid_register_number')
        expectApiError(() => buildRegistrationProfile({
            decodedToken: studentToken,
            payload: { ...studentPayload, full_name: 'A'.repeat(101) },
            now,
        }), 'invalid_full_name')
    })

    it('treats an identical stored identity as idempotent and rejects conflicts', () => {
        const registrationProfile = buildRegistrationProfile({
            decodedToken: studentToken,
            payload: studentPayload,
            now,
        })
        const updatedExisting = { ...registrationProfile, full_name: 'Student Updated' }

        expect(assertIdempotentRegistration({
            existingProfile: updatedExisting,
            registrationProfile,
        })).toBe(updatedExisting)

        expectApiError(() => assertIdempotentRegistration({
            existingProfile: { ...updatedExisting, requested_role: 'admin' },
            registrationProfile,
        }), 'profile_registration_conflict')
    })
})

describe('authorized profile identity policy', () => {
    const assertIdentity = (email, role = 'student', profileEmail = email) => (
        assertAuthorizedProfileIdentity({
            decodedToken: { uid: 'identity-1', email },
            profile: { id: 'identity-1', email: profileEmail, role },
        })
    )

    it('accepts normalized student and faculty-domain role mappings', () => {
        expect(assertIdentity(
            'Student.One@btech.christuniversity.in',
            'student',
            ' student.one@btech.christuniversity.in ',
        )).toEqual({
            email: 'student.one@btech.christuniversity.in',
            institutionalRole: 'student',
        })
        expect(assertIdentity('faculty.one@christuniversity.in', 'faculty').institutionalRole).toBe('faculty')
        expect(assertIdentity('admin.one@christuniversity.in', 'admin').institutionalRole).toBe('faculty')
        expect(getInstitutionalRole('person@example.com')).toBeNull()
    })

    it('rejects UID and immutable-email mismatches', () => {
        expectApiError(() => assertAuthorizedProfileIdentity({
            decodedToken: { uid: 'token-user', email: 'student.one@btech.christuniversity.in' },
            profile: {
                id: 'profile-user',
                email: 'student.one@btech.christuniversity.in',
                role: 'student',
            },
        }), 'profile_identity_mismatch')
        expectApiError(() => assertIdentity(
            'student.one@btech.christuniversity.in',
            'student',
            'student.two@btech.christuniversity.in',
        ), 'profile_identity_mismatch')
    })

    it('rejects unsupported domains and cross-domain privilege mappings', () => {
        expectApiError(() => assertIdentity('person@example.com', 'student'), 'unsupported_profile_email_domain')
        expectApiError(() => assertIdentity('student.one@btech.christuniversity.in', 'admin'), 'profile_role_mismatch')
        expectApiError(() => assertIdentity('faculty.one@christuniversity.in', 'student'), 'profile_role_mismatch')
    })
})

describe('own-profile patch policy', () => {
    it('normalizes editable profile values only', () => {
        expect(sanitizeOwnProfilePatch({
            role: 'student',
            payload: {
                full_name: '  Student Two  ',
                department: 'EEE',
                phone: '+91 99999 88888',
            },
        })).toEqual({
            full_name: 'Student Two',
            department: 'EEE',
            phone: '+91 99999 88888',
        })
    })

    it('rejects privileged, empty, and invalid edits', () => {
        expectApiError(() => sanitizeOwnProfilePatch({
            role: 'student',
            payload: { role: 'admin' },
        }), 'unsupported_profile_field')
        expectApiError(() => sanitizeOwnProfilePatch({
            role: 'student',
            payload: {},
        }), 'no_changes')
        expectApiError(() => sanitizeOwnProfilePatch({
            role: 'student',
            payload: { phone: '' },
        }), 'invalid_phone')
    })

    it('preserves unchanged legacy values while validating every actual change', () => {
        expect(sanitizeOwnProfilePatch({
            role: 'admin',
            currentProfile: {
                full_name: 'Bootstrap Admin',
                department: 'Administration',
                phone: '',
            },
            payload: {
                full_name: 'Bootstrap Administrator',
                department: 'Administration',
                phone: '',
            },
        })).toEqual({ full_name: 'Bootstrap Administrator' })

        expectApiError(() => sanitizeOwnProfilePatch({
            role: 'admin',
            currentProfile: { department: 'Administration' },
            payload: { department: 'Executive Office' },
        }), 'invalid_department')
    })
})
