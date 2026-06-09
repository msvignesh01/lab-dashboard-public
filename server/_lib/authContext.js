import { adminAuth, adminDb, FieldValue } from './firebaseAdmin.js'
import { ApiError, getBearerToken } from './http.js'
import { writeAuditLog } from './audit.js'

const ACTIVE_STATUS = 'active'
const ADMIN_ROLE = 'admin'

const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const getBootstrapAdminEmails = () => {
    return new Set(
        String(process.env.BOOTSTRAP_ADMIN_EMAILS || '')
            .split(',')
            .map((email) => normalizeEmail(email))
            .filter(Boolean),
    )
}

const buildBootstrapAdminProfile = (decodedToken) => {
    const now = new Date().toISOString()
    return {
        id: decodedToken.uid,
        email: normalizeEmail(decodedToken.email),
        full_name: decodedToken.name || decodedToken.email || 'Bootstrap Admin',
        role: ADMIN_ROLE,
        requested_role: ADMIN_ROLE,
        status: ACTIVE_STATUS,
        department: 'Administration',
        phone: '',
        register_number: '',
        specialization: '',
        year_of_passout: '',
        approved_by: decodedToken.uid,
        approved_at: now,
        suspended_at: null,
        email_verified_at: now,
        created_at: now,
        updated_at: now,
        bootstrap_admin: true,
    }
}

const normalizeBootstrapAdmin = async (decodedToken, profileRef, existingProfile) => {
    const bootstrapProfile = buildBootstrapAdminProfile(decodedToken)

    if (!existingProfile) {
        await profileRef.set(bootstrapProfile)
        await writeAuditLog({
            actor: { uid: decodedToken.uid, profile: { role: ADMIN_ROLE } },
            action: 'admin.bootstrap_provisioned',
            entity_type: 'profile',
            entity_id: decodedToken.uid,
            metadata: { email: bootstrapProfile.email, created: true },
        }).catch(() => {})
        return bootstrapProfile
    }

    if (existingProfile.role === ADMIN_ROLE && existingProfile.status === ACTIVE_STATUS) {
        return existingProfile
    }

    const update = {
        role: ADMIN_ROLE,
        requested_role: ADMIN_ROLE,
        status: ACTIVE_STATUS,
        approved_by: decodedToken.uid,
        approved_at: existingProfile.approved_at || bootstrapProfile.approved_at,
        suspended_at: null,
        email_verified_at: existingProfile.email_verified_at || bootstrapProfile.email_verified_at,
        updated_at: bootstrapProfile.updated_at,
        bootstrap_admin: true,
    }

    await profileRef.set(update, { merge: true })
    await writeAuditLog({
        actor: { uid: decodedToken.uid, profile: { role: ADMIN_ROLE } },
        action: 'admin.bootstrap_provisioned',
        entity_type: 'profile',
        entity_id: decodedToken.uid,
        metadata: { email: bootstrapProfile.email, created: false },
    }).catch(() => {})
    return { ...existingProfile, ...update }
}

export const getAuthenticatedContext = async (req, options = {}) => {
    const {
        requireVerified = true,
        requireActive = false,
        roles = [],
    } = options

    const token = getBearerToken(req)
    const decodedToken = await adminAuth.verifyIdToken(token, true)
    const email = normalizeEmail(decodedToken.email)

    if (requireVerified && decodedToken.email_verified !== true) {
        throw new ApiError(403, 'Please verify your email before continuing.', 'email_not_verified')
    }

    const profileRef = adminDb.collection('profiles').doc(decodedToken.uid)
    const profileSnap = await profileRef.get()
    const bootstrapAdminEmails = getBootstrapAdminEmails()
    const isBootstrapAdmin = email && bootstrapAdminEmails.has(email) && decodedToken.email_verified === true

    let profile = profileSnap.exists ? { id: profileSnap.id, ...profileSnap.data() } : null

    if (isBootstrapAdmin) {
        profile = await normalizeBootstrapAdmin(decodedToken, profileRef, profile)
    } else if (profile && decodedToken.email_verified === true && !profile.email_verified_at) {
        const update = {
            email_verified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }
        await profileRef.set(update, { merge: true })
        profile = { ...profile, ...update }
    }

    if (!profile) {
        throw new ApiError(404, 'Profile not found.', 'profile_not_found')
    }

    if (requireActive && profile.status !== ACTIVE_STATUS) {
        throw new ApiError(403, 'Your account is not active.', 'profile_not_active')
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles]
    if (allowedRoles.length > 0 && !allowedRoles.includes(profile.role)) {
        throw new ApiError(403, 'You do not have permission to perform this action.', 'permission_denied')
    }

    return {
        uid: decodedToken.uid,
        email,
        decodedToken,
        profile,
        profileRef,
        isBootstrapAdmin,
        serverTimestamp: FieldValue.serverTimestamp,
    }
}
