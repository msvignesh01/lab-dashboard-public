import {
  createUserWithEmailAndPassword,
  deleteUser,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import {
  deleteDoc,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '@/lib/firebase'
import { securityUtils } from '@/lib/security'
import { apiRequest } from '@/services/apiClient'
import { EMAIL_DOMAINS } from '@/lib/constants'

const nowIso = () => new Date().toISOString()

const toServiceError = (err, fallback = 'An unexpected error occurred') => {
  if (err?.code === 'permission-denied') {
    return { message: 'You do not have permission to perform this action.', code: err.code }
  }

  if (['failed-precondition', 'unavailable', 'internal', 'resource-exhausted'].includes(err?.code)) {
    return { message: 'The service is temporarily unavailable. Please try again later.', code: err.code }
  }

  return {
    message: typeof err?.message === 'string' && err.message.trim() ? err.message : fallback,
    code: err?.code,
  }
}

const mapAuthError = (err) => {
  const invalidCredentialCodes = new Set([
    'auth/invalid-credential',
    'auth/invalid-email',
    'auth/user-not-found',
    'auth/wrong-password',
  ])

  if (invalidCredentialCodes.has(err?.code)) {
    return { message: 'Invalid email or password. Please try again.', code: err.code }
  }

  if (err?.code === 'auth/email-already-in-use') {
    return { message: 'An account already exists for this email.', code: err.code }
  }

  if (err?.code === 'auth/weak-password') {
    return { message: 'Password does not meet security requirements.', code: err.code }
  }

  if (err?.code === 'auth/too-many-requests') {
    return { message: 'Too many attempts. Please wait a few minutes before trying again.', code: err.code }
  }

  return toServiceError(err)
}

const toAuthUser = (user) => {
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

const buildProfile = (user, metadata, email) => {
  const requestedRole = metadata?.role === 'faculty' ? 'faculty' : 'student'
  const timestamp = nowIso()
  const isFacultyRequest = requestedRole === 'faculty'

  const profile = {
    id: user.uid,
    email,
    full_name: typeof metadata?.full_name === 'string' ? metadata.full_name.trim().substring(0, 100) : '',
    role: requestedRole,
    requested_role: requestedRole,
    status: isFacultyRequest ? 'pending_approval' : 'active',
    department: typeof metadata?.department === 'string' ? metadata.department.trim().substring(0, 100) : '',
    phone: typeof metadata?.phone === 'string' ? metadata.phone.trim().substring(0, 40) : '',
    register_number: typeof metadata?.register_number === 'string' ? metadata.register_number.trim().substring(0, 40) : '',
    specialization: typeof metadata?.specialization === 'string' ? metadata.specialization.trim().substring(0, 100) : '',
    year_of_passout: typeof metadata?.year_of_passout === 'string' ? metadata.year_of_passout.trim().substring(0, 10) : '',
    approved_by: null,
    approved_at: null,
    suspended_at: null,
    email_verified_at: null,
    created_at: timestamp,
    updated_at: timestamp,
  }

  return profile
}

export const authService = {
  /**
   * Sign up a new user with security validation.
   * @param {string} email
   * @param {string} password
   * @param {object} metadata - { full_name, department, role, etc. }
   */
  signUp: async (email, password, metadata) => {
    let createdUser = null

    try {
      if (!securityUtils.validateEmail(email)) {
        return { data: null, error: { message: 'Invalid email format' } }
      }

      if (!securityUtils.validatePassword(password)) {
        return { data: null, error: { message: 'Password does not meet security requirements' } }
      }

      const normalizedEmail = email.toLowerCase().trim()
      const profileMetadata = metadata && typeof metadata === 'object' ? metadata : {}
      const requestedRole = profileMetadata.role === 'faculty' ? 'faculty' : 'student'
      const isStudentEmail = normalizedEmail.endsWith(EMAIL_DOMAINS.STUDENT)
      const isFacultyEmail = normalizedEmail.endsWith(EMAIL_DOMAINS.FACULTY) && !isStudentEmail

      if (requestedRole === 'student' && !isStudentEmail) {
        return { data: null, error: { message: `Students must use ${EMAIL_DOMAINS.STUDENT} email addresses` } }
      }

      if (requestedRole === 'faculty' && !isFacultyEmail) {
        return { data: null, error: { message: `Faculty must use ${EMAIL_DOMAINS.FACULTY} email addresses` } }
      }

      const { user } = await createUserWithEmailAndPassword(firebaseAuth, normalizedEmail, password)
      createdUser = user

      const profile = buildProfile(user, profileMetadata, normalizedEmail)
      await setDoc(doc(firestore, 'profiles', user.uid), profile)

      if (profile.full_name) {
        await updateProfile(user, { displayName: profile.full_name })
      }

      await sendEmailVerification(user).catch((err) => {
        securityUtils.secureLog('warn', 'Email verification could not be sent', err.message)
      })

      await firebaseSignOut(firebaseAuth)

      securityUtils.secureLog('info', 'User signup successful', { email: securityUtils.maskEmail(normalizedEmail) })
      return { data: { user: toAuthUser(user), profile }, error: null }
    } catch (err) {
      securityUtils.secureLog('error', 'Signup failed', err.message)

      if (createdUser) {
        await deleteDoc(doc(firestore, 'profiles', createdUser.uid)).catch((deleteError) => {
          securityUtils.secureLog('warn', 'Failed to roll back Firestore profile after signup error', deleteError.message)
        })

        await deleteUser(createdUser).catch((deleteError) => {
          securityUtils.secureLog('warn', 'Failed to roll back Firebase Auth user after signup error', deleteError.message)
        })
      }

      return { data: null, error: mapAuthError(err) }
    }
  },

  /**
   * Sign in an existing user with Firebase Auth.
   * @param {string} email
   * @param {string} password
   */
  signIn: async (email, password) => {
    try {
      if (!securityUtils.validateEmail(email)) {
        return { data: null, error: { message: 'Invalid email format' } }
      }

      if (!password || password.length < 6) {
        return { data: null, error: { message: 'Invalid password' } }
      }

      const normalizedEmail = email.toLowerCase().trim()

      const { user } = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, password)

      securityUtils.secureLog('info', 'User signin successful', { email: securityUtils.maskEmail(normalizedEmail) })
      return { data: { user: toAuthUser(user) }, error: null }
    } catch (err) {
      const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : ''
      securityUtils.secureLog('warn', 'Signin failed', { email: securityUtils.maskEmail(normalizedEmail), reason: err.message })
      return { data: null, error: mapAuthError(err) }
    }
  },

  /**
   * Sign out the current user.
   */
  signOut: async () => {
    try {
      await firebaseSignOut(firebaseAuth)
      securityUtils.secureLog('info', 'User signed out successfully')
      return { error: null }
    } catch (err) {
      securityUtils.secureLog('error', 'Signout failed', err.message)
      return { error: toServiceError(err) }
    }
  },

  /**
   * Get the current Firebase Auth user in the same shape the UI expects.
   */
  getCurrentUser: async () => {
    return toAuthUser(firebaseAuth.currentUser)
  },

  resendVerificationEmail: async () => {
    try {
      const currentUser = firebaseAuth.currentUser
      if (!currentUser) {
        return { error: { message: 'You need to sign in first.', code: 'auth_required' } }
      }
      if (currentUser.emailVerified) {
        return { error: null }
      }
      await sendEmailVerification(currentUser)
      return { error: null }
    } catch (err) {
      securityUtils.secureLog('warn', 'Email verification resend failed', err.message)
      return { error: mapAuthError(err) }
    }
  },

  sendPasswordReset: async (email) => {
    try {
      const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : ''
      if (!securityUtils.validateEmail(normalizedEmail)) {
        return { error: { message: 'Enter a valid university email address.', code: 'invalid_email' } }
      }
      await sendPasswordResetEmail(firebaseAuth, normalizedEmail)
      return { error: null }
    } catch (err) {
      securityUtils.secureLog('warn', 'Password reset failed', { email: securityUtils.maskEmail(email), reason: err.message })
      return { error: mapAuthError(err) }
    }
  },

  reloadCurrentUser: async () => {
    const currentUser = firebaseAuth.currentUser
    if (!currentUser) return null
    await currentUser.reload()
    await currentUser.getIdToken(true)
    return toAuthUser(firebaseAuth.currentUser)
  },

  /**
   * Update the signed-in user's own editable profile fields.
   * Only fields the Firestore security rules permit are sent; identity/role/status
   * fields are never included so the rules' identity check always passes.
   */
  updateProfile: async (updates) => {
    try {
      const currentUser = firebaseAuth.currentUser
      if (!currentUser) {
        return { data: null, error: { message: 'You need to sign in first.', code: 'auth_required' } }
      }

      const lengths = {
        full_name: 100,
        department: 100,
        specialization: 100,
        phone: 40,
        register_number: 40,
        year_of_passout: 10,
      }

      const patch = {}
      for (const key of Object.keys(lengths)) {
        if (updates?.[key] !== undefined) {
          patch[key] = typeof updates[key] === 'string' ? updates[key].trim().substring(0, lengths[key]) : ''
        }
      }

      if (Object.keys(patch).length === 0) {
        return { data: null, error: { message: 'No changes to save.' } }
      }

      patch.updated_at = nowIso()
      await updateDoc(doc(firestore, 'profiles', currentUser.uid), patch)
      securityUtils.secureLog('info', 'Profile updated', { fields: Object.keys(patch) })
      return { data: patch, error: null }
    } catch (err) {
      securityUtils.secureLog('error', 'Profile update failed', err.message)
      return { data: null, error: toServiceError(err) }
    }
  },

  /**
   * Get user profile by ID with security validation.
   * @param {string} userId
   */
  getProfile: async (userId) => {
    try {
      if (!securityUtils.validateFirestoreId(userId)) {
        return { data: null, error: { message: 'Invalid user ID' } }
      }

      return apiRequest('/api/profile/me', { forceRefreshToken: true })
    } catch (err) {
      securityUtils.secureLog('error', 'Unexpected error fetching profile', err.message)
      return { data: null, error: toServiceError(err) }
    }
  },
}

export { toAuthUser }
