export const PROFILE_STATUS = {
    ACTIVE: 'active',
    PENDING_APPROVAL: 'pending_approval',
    SUSPENDED: 'suspended',
}

export const ROLE_RANK = {
    student: 1,
    faculty: 2,
    admin: 3,
}

export const isActiveProfile = (profile) => {
    return profile?.status === PROFILE_STATUS.ACTIVE
}

export const hasProfileRole = (profile, requiredRole) => {
    if (!isActiveProfile(profile) || !profile?.role || !requiredRole) return false
    return ROLE_RANK[profile.role] >= ROLE_RANK[requiredRole]
}

export const getAccountAccessState = ({ user, profile, profileError }) => {
    if (!user) return 'signed_out'
    if (!user.emailVerified) return 'email_unverified'
    if (profileError) return 'profile_error'
    if (!profile) return 'profile_missing'
    if (profile.status === PROFILE_STATUS.PENDING_APPROVAL) return 'pending_approval'
    if (profile.status === PROFILE_STATUS.SUSPENDED) return 'suspended'
    if (profile.status !== PROFILE_STATUS.ACTIVE) return 'profile_inactive'
    return 'active'
}
