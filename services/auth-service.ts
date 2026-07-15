"use client"

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateFirebaseProfile,
  type User,
} from "firebase/auth"
import { EMAIL_DOMAINS } from "@/lib/constants"
import { getFirebaseAuth } from "@/lib/firebase-client"
import { validateEmail, validatePassword } from "@/lib/security"
import type { AuthUser, Profile, ServiceError, ServiceResult, SignupMetadata } from "@/lib/types"
import { apiRequest } from "@/services/api-client"

function toAuthUser(user: User | null): AuthUser | null {
  if (!user) return null
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email,
    emailVerified: user.emailVerified,
    displayName: user.displayName,
    photoURL: user.photoURL,
  }
}

function mapAuthError(error: unknown): ServiceError {
  const candidate = error as { code?: string; message?: string }
  if (["auth/invalid-credential", "auth/invalid-email", "auth/user-not-found", "auth/wrong-password"].includes(candidate.code ?? "")) {
    return { message: "Invalid email or password.", code: candidate.code ?? "invalid_credentials" }
  }
  if (candidate.code === "auth/email-already-in-use") {
    return { message: "An account already exists for this email.", code: candidate.code }
  }
  if (candidate.code === "auth/weak-password") {
    return { message: "Password does not meet the security requirements.", code: candidate.code }
  }
  if (candidate.code === "auth/too-many-requests") {
    return { message: "Too many attempts. Please wait before trying again.", code: candidate.code }
  }
  if (candidate.code === "auth/user-disabled") {
    return { message: "This account is unavailable. Contact the lab administrator.", code: candidate.code }
  }
  return {
    message: "The authentication service is temporarily unavailable.",
    code: candidate.code ?? "auth_unavailable",
  }
}

export interface SignupWarning {
  code: "display_name_sync_failed" | "verification_email_not_sent" | "sign_out_failed"
  message: string
}

interface ProfileRegistrationResponse {
  profile: Profile
  created: boolean
}

export const authService = {
  async signUp(
    emailValue: string,
    password: string,
    metadata: SignupMetadata,
  ): Promise<ServiceResult<{
    user: AuthUser
    profile: Profile
    warnings: SignupWarning[]
    registrationCreated: boolean
    recoveredRegistration: boolean
  }>> {
    const email = emailValue.toLowerCase().trim()

    if (!validateEmail(email)) {
      return { data: null, error: { message: "Enter a valid institutional email.", code: "invalid_email" } }
    }
    if (!validatePassword(password)) {
      return { data: null, error: { message: "Password does not meet the security requirements.", code: "weak_password" } }
    }

    const isStudentEmail = email.endsWith(EMAIL_DOMAINS.STUDENT)
    const isFacultyEmail = email.endsWith(EMAIL_DOMAINS.FACULTY) && !isStudentEmail
    if (metadata.role === "student" && !isStudentEmail) {
      return { data: null, error: { message: `Students must use ${EMAIL_DOMAINS.STUDENT}.`, code: "invalid_student_domain" } }
    }
    if (metadata.role === "faculty" && !isFacultyEmail) {
      return { data: null, error: { message: `Faculty must use ${EMAIL_DOMAINS.FACULTY}.`, code: "invalid_faculty_domain" } }
    }

    try {
      const auth = getFirebaseAuth()
      let user: User
      let recoveredRegistration = false

      try {
        const credential = await createUserWithEmailAndPassword(auth, email, password)
        user = credential.user
      } catch (error) {
        const candidate = error as { code?: string }
        if (candidate.code !== "auth/email-already-in-use") throw error

        try {
          const credential = await signInWithEmailAndPassword(auth, email, password)
          user = credential.user
          recoveredRegistration = true
        } catch {
          throw error
        }
      }

      const registration = await apiRequest<ProfileRegistrationResponse>("/api/profile/register", {
        method: "POST",
        forceRefreshToken: true,
        body: {
          uid: user.uid,
          email,
          full_name: metadata.full_name,
          role: metadata.role,
          department: metadata.department,
          phone: metadata.phone,
          register_number: metadata.register_number,
          specialization: metadata.specialization,
          year_of_passout: metadata.year_of_passout,
        },
      })

      if (registration.error) {
        await firebaseSignOut(auth).catch(() => undefined)
        return { data: null, error: registration.error }
      }

      const warnings: SignupWarning[] = []
      try {
        if (user.displayName !== registration.data.profile.full_name) {
          await updateFirebaseProfile(user, { displayName: registration.data.profile.full_name })
        }
      } catch {
        warnings.push({
          code: "display_name_sync_failed",
          message: "The account was created, but the authentication display name could not be synchronized.",
        })
      }

      if (!user.emailVerified) {
        try {
          await sendEmailVerification(user)
        } catch {
          warnings.push({
            code: "verification_email_not_sent",
            message: "The account was created, but the verification email was not sent. Sign in to resend it.",
          })
        }
      }

      try {
        await firebaseSignOut(auth)
      } catch {
        warnings.push({
          code: "sign_out_failed",
          message: "The account was created, but this browser could not sign out automatically.",
        })
      }

      return {
        data: {
          user: toAuthUser(user)!,
          profile: registration.data.profile,
          warnings,
          registrationCreated: registration.data.created,
          recoveredRegistration,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error: mapAuthError(error) }
    }
  },

  async signIn(emailValue: string, password: string): Promise<ServiceResult<{ user: AuthUser }>> {
    const email = emailValue.toLowerCase().trim()
    if (!validateEmail(email) || !password) {
      return { data: null, error: { message: "Invalid email or password.", code: "invalid_credentials" } }
    }
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
      return { data: { user: toAuthUser(credential.user)! }, error: null }
    } catch (error) {
      return { data: null, error: mapAuthError(error) }
    }
  },

  async signOut(): Promise<{ error: ServiceError | null }> {
    try {
      await firebaseSignOut(getFirebaseAuth())
      return { error: null }
    } catch (error) {
      return { error: mapAuthError(error) }
    }
  },

  async sendPasswordReset(emailValue: string): Promise<{ error: ServiceError | null }> {
    const email = emailValue.toLowerCase().trim()
    if (!validateEmail(email)) {
      return { error: { message: "Enter a valid institutional email.", code: "invalid_email" } }
    }
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email)
      return { error: null }
    } catch (error) {
      return { error: mapAuthError(error) }
    }
  },

  async resendVerificationEmail(): Promise<{ error: ServiceError | null }> {
    const user = getFirebaseAuth().currentUser
    if (!user) return { error: { message: "Sign in first.", code: "auth_required" } }
    if (user.emailVerified) return { error: null }
    try {
      await sendEmailVerification(user)
      return { error: null }
    } catch (error) {
      return { error: mapAuthError(error) }
    }
  },

  async reloadCurrentUser(): Promise<AuthUser | null> {
    const user = getFirebaseAuth().currentUser
    if (!user) return null
    await user.reload()
    await user.getIdToken(true)
    return toAuthUser(getFirebaseAuth().currentUser)
  },

  getProfile(): Promise<ServiceResult<Profile>> {
    return apiRequest<Profile>("/api/profile/me", { forceRefreshToken: true })
  },

  async updateProfile(updates: Partial<Pick<Profile, "full_name" | "department" | "phone" | "register_number" | "specialization" | "year_of_passout">>): Promise<ServiceResult<Profile>> {
    const user = getFirebaseAuth().currentUser
    if (!user) return { data: null, error: { message: "Sign in first.", code: "auth_required" } }

    const patch: Record<string, string> = {}
    const editableFields = [
      "full_name",
      "department",
      "phone",
      "register_number",
      "specialization",
      "year_of_passout",
    ] as const
    for (const key of editableFields) {
      const value = updates[key as keyof typeof updates]
      if (value !== undefined) patch[key] = value
    }
    if (Object.keys(patch).length === 0) {
      return { data: null, error: { message: "No changes to save.", code: "no_changes" } }
    }

    const result = await apiRequest<Profile>("/api/profile/me", {
      method: "PATCH",
      body: patch,
      forceRefreshToken: true,
    })
    if (result.error) return result

    if (result.data.full_name && result.data.full_name !== user.displayName) {
      await updateFirebaseProfile(user, { displayName: result.data.full_name }).catch(() => undefined)
    }
    return result
  },
}

export { toAuthUser }
