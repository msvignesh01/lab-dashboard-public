import { adminAuth, adminDb, FieldValue } from './firebaseAdmin.js'
import { ApiError, getBearerToken } from './http.js'
import { writeAuditLog } from './audit.js'
import { verifyFirebaseIdToken } from './authPolicy.js'
import {
    assertAuthorizedProfileIdentity,
    getInstitutionalRole,
    normalizeInstitutionalEmail,
} from './profilePolicy.js'

const ACTIVE_STATUS = 'active'
const ADMIN_ROLE = 'admin'

const getBootstrapAdminEmails = () => {
    return new Set(
        String(process.env.BOOTSTRAP_ADMIN_EMAILS || '')
            .split(',')
            .map((email) => normalizeInstitutionalEmail(email))
            .filter(Boolean),
    )
}

const buildBootstrapAdminProfile = (decodedToken) => {
    const now = new Date().toISOString()
    return {
        id: decodedToken.uid,
        email: normalizeInstitutionalEmail(decodedToken.email),
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

const normalizeBootstrapAdmin = async (decodedToken, profileRef) => {
    const bootstrapProfile = buildBootstrapAdminProfile(decodedToken)

    return adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(profileRef)
        const persistedProfile = snapshot.exists
            ? { ...snapshot.data(), id: snapshot.id }
            : null

        if (persistedProfile) {
            assertAuthorizedProfileIdentity({ decodedToken, profile: persistedProfile })
            if (persistedProfile.role === ADMIN_ROLE
                && persistedProfile.status === ACTIVE_STATUS
                && persistedProfile.requested_role === ADMIN_ROLE
                && persistedProfile.email_verified_at
                && persistedProfile.bootstrap_admin === true) {
                return persistedProfile
            }
        }

        const created = !persistedProfile
        const update = created
            ? bootstrapProfile
            : {
                role: ADMIN_ROLE,
                requested_role: ADMIN_ROLE,
                status: ACTIVE_STATUS,
                approved_by: decodedToken.uid,
                approved_at: persistedProfile.approved_at || bootstrapProfile.approved_at,
                suspended_at: null,
                email_verified_at: persistedProfile.email_verified_at || bootstrapProfile.email_verified_at,
                updated_at: bootstrapProfile.updated_at,
                bootstrap_admin: true,
            }

        if (created) transaction.set(profileRef, update)
        else transaction.set(profileRef, update, { merge: true })
        await writeAuditLog({
            transaction,
            actor: { uid: decodedToken.uid, profile: { role: ADMIN_ROLE } },
            action: 'admin.bootstrap_provisioned',
            entity_type: 'profile',
            entity_id: decodedToken.uid,
            metadata: { email: bootstrapProfile.email, created },
        })
        return created ? bootstrapProfile : { ...persistedProfile, ...update }
    })
}

export const getAuthenticatedContext = async (req, options = {}) => {
    const {
        requireVerified = true,
        requireActive = false,
        roles = [],
    } = options

    const token = getBearerToken(req)
    const decodedToken = await verifyFirebaseIdToken(adminAuth, token)
    const email = normalizeInstitutionalEmail(decodedToken.email)

    if (requireVerified && decodedToken.email_verified !== true) {
        throw new ApiError(403, 'Please verify your email before continuing.', 'email_not_verified')
    }

    const profileRef = adminDb.collection('profiles').doc(decodedToken.uid)
    const bootstrapAdminEmails = getBootstrapAdminEmails()
    const isBootstrapAdmin = Boolean(email && bootstrapAdminEmails.has(email))

    if (isBootstrapAdmin && decodedToken.email_verified !== true) {
        throw new ApiError(403, 'Please verify your email before continuing.', 'email_not_verified')
    }
    if (isBootstrapAdmin && getInstitutionalRole(email) !== 'faculty') {
        throw new ApiError(
            403,
            'Bootstrap administrators must use a supported faculty email domain.',
            'invalid_bootstrap_admin_domain',
        )
    }

    let profile
    if (isBootstrapAdmin) {
        profile = await normalizeBootstrapAdmin(decodedToken, profileRef)
    } else {
        const profileSnap = await profileRef.get()
        profile = profileSnap.exists ? { ...profileSnap.data(), id: profileSnap.id } : null
    }

    if (profile) {
        assertAuthorizedProfileIdentity({ decodedToken, profile })
    }

    if (!isBootstrapAdmin && profile && decodedToken.email_verified === true && !profile.email_verified_at) {
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
