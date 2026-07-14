import { DEPARTMENTS, EMAIL_DOMAINS } from '../../shared/constants.js'
import { ApiError } from './http.js'
import { isValidFirestoreId } from './ids.js'

const REGISTRATION_FIELDS = new Set([
    'uid',
    'email',
    'full_name',
    'role',
    'department',
    'phone',
    'register_number',
    'specialization',
    'year_of_passout',
])

export const EDITABLE_PROFILE_FIELDS = [
    'full_name',
    'department',
    'phone',
    'register_number',
    'specialization',
    'year_of_passout',
]

const EDITABLE_PROFILE_FIELD_SET = new Set(EDITABLE_PROFILE_FIELDS)
const DEPARTMENT_SET = new Set(DEPARTMENTS)
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u
const FULL_NAME = /^[\p{L}\p{M}][\p{L}\p{M}\s.'-]*$/u
const REGISTER_NUMBER = /^[A-Za-z0-9][A-Za-z0-9._/-]{5,39}$/u

const ensureObject = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(400, 'Invalid profile payload.', 'invalid_profile_payload')
    }
    return value
}

const rejectUnknownFields = (payload, allowedFields) => {
    if (Object.keys(payload).some((key) => !allowedFields.has(key))) {
        throw new ApiError(400, 'Profile payload contains unsupported fields.', 'unsupported_profile_field')
    }
}

const readText = (payload, key, {
    min = 0,
    max,
    required = false,
    label,
    code,
} = {}) => {
    const value = payload[key]
    if (value === undefined) {
        if (required) throw new ApiError(400, `${label} is required.`, code)
        return undefined
    }
    if (typeof value !== 'string') {
        throw new ApiError(400, `${label} is invalid.`, code)
    }
    const normalized = value.trim()
    if ((required && normalized.length === 0)
        || normalized.length < min
        || normalized.length > max
        || CONTROL_CHARACTERS.test(normalized)) {
        throw new ApiError(400, `${label} is invalid.`, code)
    }
    return normalized
}

const normalizeFullName = (payload, required) => {
    const value = readText(payload, 'full_name', {
        min: 2,
        max: 100,
        required,
        label: 'Full name',
        code: 'invalid_full_name',
    })
    if (value !== undefined && !FULL_NAME.test(value)) {
        throw new ApiError(400, 'Full name is invalid.', 'invalid_full_name')
    }
    return value
}

const normalizeDepartment = (payload, required) => {
    const value = readText(payload, 'department', {
        min: 2,
        max: 100,
        required,
        label: 'Department',
        code: 'invalid_department',
    })
    if (value !== undefined && !DEPARTMENT_SET.has(value)) {
        throw new ApiError(400, 'Select a valid department.', 'invalid_department')
    }
    return value
}

const normalizePhone = (payload, required) => {
    const value = readText(payload, 'phone', {
        max: 40,
        required,
        label: 'Phone number',
        code: 'invalid_phone',
    })
    if (value === undefined || (!required && value === '')) return value

    const digits = value.replace(/\D/gu, '')
    if (!/^\+?[0-9][0-9\s()-]*$/u.test(value) || digits.length < 10 || digits.length > 15) {
        throw new ApiError(400, 'Phone number is invalid.', 'invalid_phone')
    }
    return value
}

const normalizeRegisterNumber = (payload, required) => {
    const value = readText(payload, 'register_number', {
        max: 40,
        required,
        label: 'Register number',
        code: 'invalid_register_number',
    })
    if (value === undefined || (!required && value === '')) return value
    if (!REGISTER_NUMBER.test(value)) {
        throw new ApiError(400, 'Register number is invalid.', 'invalid_register_number')
    }
    return value
}

const normalizeSpecialization = (payload, required) => {
    return readText(payload, 'specialization', {
        min: required ? 2 : 0,
        max: 100,
        required,
        label: 'Course or specialization',
        code: 'invalid_specialization',
    })
}

const normalizePassoutYear = (payload, required) => {
    const value = readText(payload, 'year_of_passout', {
        max: 4,
        required,
        label: 'Year of passout',
        code: 'invalid_year_of_passout',
    })
    if (value === undefined || (!required && value === '')) return value

    const year = Number(value)
    if (!/^\d{4}$/u.test(value) || year < 2000 || year > 2100) {
        throw new ApiError(400, 'Year of passout is invalid.', 'invalid_year_of_passout')
    }
    return value
}

export const normalizeInstitutionalEmail = (value) => String(value || '').trim().toLowerCase()

export const getInstitutionalRole = (emailValue) => {
    const email = normalizeInstitutionalEmail(emailValue)
    if (email.length > 254 || !/^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9.-]+$/u.test(email)) return null
    if (email.endsWith(EMAIL_DOMAINS.STUDENT)) return 'student'
    if (email.endsWith(EMAIL_DOMAINS.FACULTY)) return 'faculty'
    return null
}

/**
 * Binds a persisted profile to the identity carried by a verified Firebase ID
 * token. Profile email is immutable: a mismatch is rejected instead of being
 * repaired from request data. Role/domain checks prevent a student identity
 * from inheriting faculty or administrator authority through a malformed or
 * legacy profile.
 */
export const assertAuthorizedProfileIdentity = ({ decodedToken, profile }) => {
    const tokenUid = typeof decodedToken?.uid === 'string' ? decodedToken.uid : ''
    const tokenEmail = normalizeInstitutionalEmail(decodedToken?.email)
    const profileEmail = normalizeInstitutionalEmail(profile?.email)

    if (!profile
        || !isValidFirestoreId(tokenUid)
        || profile.id !== tokenUid
        || !tokenEmail
        || !profileEmail
        || tokenEmail !== profileEmail) {
        throw new ApiError(
            403,
            'Your authenticated identity does not match this profile.',
            'profile_identity_mismatch',
        )
    }

    const institutionalRole = getInstitutionalRole(tokenEmail)
    if (!institutionalRole) {
        throw new ApiError(
            403,
            'This account does not use a supported institutional email domain.',
            'unsupported_profile_email_domain',
        )
    }

    const roleAllowed = institutionalRole === 'student'
        ? profile.role === 'student'
        : profile.role === 'faculty' || profile.role === 'admin'
    if (!roleAllowed) {
        throw new ApiError(
            403,
            'The profile role does not match its institutional email domain.',
            'profile_role_mismatch',
        )
    }

    return { email: tokenEmail, institutionalRole }
}

export const buildRegistrationProfile = ({ decodedToken, payload, now = new Date().toISOString() }) => {
    const body = ensureObject(payload)
    rejectUnknownFields(body, REGISTRATION_FIELDS)

    const uid = typeof decodedToken?.uid === 'string' ? decodedToken.uid : ''
    if (!isValidFirestoreId(uid) || body.uid !== uid) {
        throw new ApiError(400, 'Authenticated user identity does not match the request.', 'profile_identity_mismatch')
    }

    const tokenEmail = normalizeInstitutionalEmail(decodedToken.email)
    const requestedEmail = typeof body.email === 'string' ? normalizeInstitutionalEmail(body.email) : ''
    const institutionalRole = getInstitutionalRole(tokenEmail)
    if (!institutionalRole || requestedEmail !== tokenEmail) {
        throw new ApiError(400, 'Authenticated email does not match a supported institutional account.', 'profile_email_mismatch')
    }

    const role = typeof body.role === 'string' ? body.role.trim() : ''
    if (role !== institutionalRole || !['student', 'faculty'].includes(role)) {
        throw new ApiError(400, 'Account role does not match the institutional email domain.', 'profile_role_mismatch')
    }

    const student = role === 'student'
    const fullName = normalizeFullName(body, true)
    const department = normalizeDepartment(body, true)
    const phone = normalizePhone(body, student) ?? ''
    const registerNumber = normalizeRegisterNumber(body, student) ?? ''
    const specialization = normalizeSpecialization(body, student) ?? ''
    const yearOfPassout = normalizePassoutYear(body, student) ?? ''

    return {
        id: uid,
        email: tokenEmail,
        full_name: fullName,
        role,
        requested_role: role,
        status: student ? 'active' : 'pending_approval',
        department,
        phone,
        register_number: registerNumber,
        specialization,
        year_of_passout: yearOfPassout,
        approved_by: null,
        approved_at: null,
        suspended_at: null,
        email_verified_at: decodedToken.email_verified === true ? now : null,
        created_at: now,
        updated_at: now,
    }
}

export const assertIdempotentRegistration = ({ existingProfile, registrationProfile }) => {
    assertAuthorizedProfileIdentity({
        decodedToken: {
            uid: registrationProfile?.id,
            email: registrationProfile?.email,
        },
        profile: existingProfile,
    })

    const existingEmail = normalizeInstitutionalEmail(existingProfile?.email)
    const expectedEmail = normalizeInstitutionalEmail(registrationProfile?.email)
    const identityMatches = existingProfile
        && existingProfile.id === registrationProfile.id
        && existingEmail === expectedEmail
        && existingProfile.requested_role === registrationProfile.requested_role

    if (!identityMatches) {
        throw new ApiError(409, 'A conflicting profile already exists for this account.', 'profile_registration_conflict')
    }
    return existingProfile
}

export const sanitizeOwnProfilePatch = ({ payload, role, currentProfile = null }) => {
    const submitted = ensureObject(payload)
    rejectUnknownFields(submitted, EDITABLE_PROFILE_FIELD_SET)
    if (Object.keys(submitted).length === 0) {
        throw new ApiError(400, 'No profile changes were provided.', 'no_changes')
    }

    // Older records can contain values outside today's stricter policy (for
    // example the bootstrap "Administration" department). Unchanged legacy
    // values must not prevent a user from correcting a different field.
    const body = currentProfile
        ? Object.fromEntries(Object.entries(submitted).filter(([key, value]) => {
            if (typeof value !== 'string') return true
            return value.trim() !== String(currentProfile[key] ?? '').trim()
        }))
        : submitted
    if (Object.keys(body).length === 0) return {}

    const student = role === 'student'
    const patch = {}
    const fullName = normalizeFullName(body, false)
    const department = normalizeDepartment(body, false)
    const phone = normalizePhone(body, student && body.phone !== undefined)
    const registerNumber = normalizeRegisterNumber(body, student && body.register_number !== undefined)
    const specialization = normalizeSpecialization(body, student && body.specialization !== undefined)
    const yearOfPassout = normalizePassoutYear(body, student && body.year_of_passout !== undefined)

    if (fullName !== undefined) patch.full_name = fullName
    if (department !== undefined) patch.department = department
    if (phone !== undefined) patch.phone = phone
    if (registerNumber !== undefined) patch.register_number = registerNumber
    if (specialization !== undefined) patch.specialization = specialization
    if (yearOfPassout !== undefined) patch.year_of_passout = yearOfPassout
    return patch
}
