"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { onAuthStateChanged } from "firebase/auth"
import { getFirebaseAuth, getFirebaseConfigurationError } from "@/lib/firebase-client"
import type {
  AccountAccessState,
  AuthUser,
  Profile,
  ServiceError,
  SignupMetadata,
} from "@/lib/types"
import { authService, toAuthUser } from "@/services/auth-service"

interface AuthContextValue {
  user: AuthUser | null
  profile: Profile | null
  loading: boolean
  profileLoading: boolean
  profileError: ServiceError | null
  accessState: AccountAccessState
  isAdmin: boolean
  canReviewBookings: boolean
  canManageMachines: boolean
  signIn: typeof authService.signIn
  signUp: (email: string, password: string, metadata: SignupMetadata) => ReturnType<typeof authService.signUp>
  signOut: typeof authService.signOut
  sendPasswordReset: typeof authService.sendPasswordReset
  resendVerificationEmail: typeof authService.resendVerificationEmail
  reloadUser: () => Promise<AuthUser | null>
  refreshProfile: () => Promise<void>
  updateOwnProfile: typeof authService.updateProfile
}

const AuthContext = createContext<AuthContextValue | null>(null)
const firebaseConfigurationError = getFirebaseConfigurationError()

function accessStateFor(
  user: AuthUser | null,
  profile: Profile | null,
  profileError: ServiceError | null,
  loading: boolean,
): AccountAccessState {
  if (loading) return "initializing"
  if (!user) return "signed_out"
  if (!user.emailVerified) return "email_unverified"
  if (profileError) return "profile_error"
  if (!profile) return "profile_missing"
  if (profile.status === "pending_approval") return "pending_approval"
  if (profile.status === "suspended") return "suspended"
  if (profile.status !== "active") return "profile_inactive"
  return "active"
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(!firebaseConfigurationError)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<ServiceError | null>(() => firebaseConfigurationError
    ? { message: firebaseConfigurationError, code: "firebase_not_configured" }
    : null)
  const requestSequence = useRef(0)

  const fetchProfile = useCallback(async () => {
    const sequence = ++requestSequence.current
    setProfileLoading(true)
    setProfileError(null)
    const result = await authService.getProfile()
    if (sequence !== requestSequence.current) return

    if (result.error) {
      setProfile(null)
      setProfileError(result.error)
    } else if (result.data?.id && result.data.email) {
      setProfile(result.data)
    } else {
      setProfile(null)
      setProfileError({ message: "The account profile is invalid.", code: "invalid_profile" })
    }
    setProfileLoading(false)
  }, [])

  useEffect(() => {
    let mounted = true
    if (firebaseConfigurationError) return

    const unsubscribe = onAuthStateChanged(
      getFirebaseAuth(),
      (firebaseUser) => {
        if (!mounted) return
        const nextUser = toAuthUser(firebaseUser)
        setUser(nextUser)
        setProfile(null)
        setProfileError(null)

        if (!nextUser || !nextUser.emailVerified) {
          requestSequence.current += 1
          setProfileLoading(false)
          setLoading(false)
          return
        }

        setLoading(true)
        void fetchProfile().finally(() => {
          if (mounted) setLoading(false)
        })
      },
      () => {
        if (!mounted) return
        setProfileError({ message: "Authentication state could not be verified.", code: "auth_state_failed" })
        setLoading(false)
      },
    )

    return () => {
      mounted = false
      requestSequence.current += 1
      unsubscribe()
    }
  }, [fetchProfile])

  const reloadUser = useCallback(async () => {
    const nextUser = await authService.reloadCurrentUser()
    setUser(nextUser)
    if (nextUser?.emailVerified) await fetchProfile()
    return nextUser
  }, [fetchProfile])

  const accessState = accessStateFor(user, profile, profileError, loading)
  const activeRole = accessState === "active" ? profile?.role : undefined

  const value = useMemo<AuthContextValue>(() => ({
    user,
    profile,
    loading,
    profileLoading,
    profileError,
    accessState,
    isAdmin: activeRole === "admin",
    canReviewBookings: activeRole === "faculty" || activeRole === "admin",
    canManageMachines: activeRole === "faculty" || activeRole === "admin",
    signIn: authService.signIn,
    signUp: authService.signUp,
    signOut: authService.signOut,
    sendPasswordReset: authService.sendPasswordReset,
    resendVerificationEmail: authService.resendVerificationEmail,
    reloadUser,
    refreshProfile: async () => { await fetchProfile() },
    updateOwnProfile: authService.updateProfile,
  }), [
    user,
    profile,
    loading,
    profileLoading,
    profileError,
    accessState,
    activeRole,
    reloadUser,
    fetchProfile,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
