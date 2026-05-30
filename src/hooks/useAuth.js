import { createContext, useContext, useState, useEffect, useCallback, useMemo, createElement } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { firebaseAuth } from '@/lib/firebase'
import { authService } from '@/services/authService'
import { securityUtils } from '@/lib/security'
import { getAccountAccessState, hasProfileRole } from '@/lib/authPolicy'

const AuthContext = createContext(null)

const toAuthUser = (firebaseUser) => {
    if (!firebaseUser) return null

    return {
        id: firebaseUser.uid,
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
    }
}

/**
 * AuthProvider - Provides shared auth state to the entire component tree.
 * Without this, each useAuth() call would create independent state,
 * causing auth changes in one component to not reflect in others.
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileError, setProfileError] = useState(null)
    const [authState, setAuthState] = useState('initializing')

    const fetchProfile = useCallback(async (userId) => {
        if (!userId) return

        setProfileLoading(true)
        setProfileError(null)
        try {
            const { data, error } = await authService.getProfile(userId)

            if (error) {
                securityUtils.secureLog('error', 'Error fetching profile', error)
                setProfile(null)
                setProfileError(error)
            } else if (securityUtils.validateApiResponse(data, ['id', 'email'])) {
                setProfile(data)
                setProfileError(null)
            } else {
                securityUtils.secureLog('warn', 'Invalid profile data received')
                setProfile(null)
                setProfileError({ message: 'Invalid profile data', code: 'invalid_profile' })
            }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error fetching profile', err.message)
            setProfile(null)
            setProfileError({ message: 'Unable to load profile', code: 'profile_load_failed' })
        } finally {
            setProfileLoading(false)
        }
    }, [])

    useEffect(() => {
        let mounted = true

        const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
            if (!mounted) return

            securityUtils.secureLog('info', `Auth state change: ${firebaseUser ? 'SIGNED_IN' : 'SIGNED_OUT'}`)

            const nextUser = toAuthUser(firebaseUser)
            setUser(nextUser)
            setAuthState(nextUser ? 'authenticated' : 'unauthenticated')

            if (nextUser) {
                setProfile(null)
                setProfileError(null)

                if (!nextUser.emailVerified) {
                    setLoading(false)
                    setProfileLoading(false)
                    return
                }

                fetchProfile(nextUser.id)
                    .finally(() => {
                        if (mounted) setLoading(false)
                    })
            } else {
                setProfile(null)
                setProfileError(null)
                setLoading(false)
            }
        }, (err) => {
            securityUtils.secureLog('error', 'Auth state observer failed', err.message)
            if (mounted) {
                setLoading(false)
                setAuthState('error')
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [fetchProfile])

    // Security: Validate user permissions
    const hasPermission = useCallback((requiredRole) => {
        return hasProfileRole(profile, requiredRole)
    }, [profile])

    const reloadUser = useCallback(async () => {
        const nextUser = await authService.reloadCurrentUser()
        setUser(nextUser)

        if (nextUser?.emailVerified) {
            await fetchProfile(nextUser.id)
        } else {
            setProfile(null)
        }

        return nextUser
    }, [fetchProfile])

    const value = useMemo(() => ({
        user,
        profile,
        loading,
        profileLoading,
        profileError,
        authState,
        accessState: getAccountAccessState({ user, profile, profileError }),
        isAdmin: profile?.status === 'active' && (profile?.role === 'admin' || profile?.role === 'faculty'),
        hasPermission,
        signIn: authService.signIn,
        signUp: authService.signUp,
        signOut: authService.signOut,
        resendVerificationEmail: authService.resendVerificationEmail,
        reloadUser,
        refreshProfile: () => user?.id ? fetchProfile(user.id) : Promise.resolve(),
    }), [user, profile, loading, profileLoading, profileError, authState, hasPermission, fetchProfile, reloadUser])

    return createElement(AuthContext.Provider, { value }, children)
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
