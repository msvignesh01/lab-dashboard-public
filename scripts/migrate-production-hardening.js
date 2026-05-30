import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const dryRun = !process.argv.includes('--apply')
const nowIso = () => new Date().toISOString()

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n')
const normalizeEmail = (email) => String(email || '').trim().toLowerCase()

const required = (name, fallback) => {
    const value = process.env[name] || (fallback ? process.env[fallback] : '')
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
    || process.env.GOOGLE_CLOUD_PROJECT
    || process.env.GCLOUD_PROJECT
    || process.env.VITE_FIREBASE_PROJECT_ID

if (!projectId) throw new Error('Missing FIREBASE_ADMIN_PROJECT_ID')

const app = initializeApp({
    credential: cert({
        projectId,
        clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL', 'GCP_CLIENT_EMAIL'),
        privateKey: normalizePrivateKey(required('FIREBASE_ADMIN_PRIVATE_KEY', 'GCP_PRIVATE_KEY')),
    }),
    projectId,
})

const auth = getAuth(app)
const db = getFirestore(app)
const bootstrapAdmins = new Set(
    String(process.env.BOOTSTRAP_ADMIN_EMAILS || '')
        .split(',')
        .map(normalizeEmail)
        .filter(Boolean),
)

const inferRequestedRole = (profile) => {
    if (profile.requested_role) return profile.requested_role
    if (profile.role === 'faculty' || profile.role === 'admin') return 'faculty'
    return 'student'
}

const getAuthUser = async (uid) => {
    try {
        return await auth.getUser(uid)
    } catch {
        return null
    }
}

const buildProfilePatch = async (doc) => {
    const profile = { id: doc.id, ...doc.data() }
    const authUser = await getAuthUser(doc.id)
    const email = normalizeEmail(authUser?.email || profile.email)
    const isBootstrapAdmin = bootstrapAdmins.has(email) && authUser?.emailVerified === true
    const requestedRole = isBootstrapAdmin ? 'admin' : inferRequestedRole(profile)
    const patch = {}

    if (!profile.requested_role) patch.requested_role = requestedRole
    if (!('approved_by' in profile)) patch.approved_by = isBootstrapAdmin ? doc.id : null
    if (!('approved_at' in profile)) patch.approved_at = isBootstrapAdmin ? nowIso() : null
    if (!('suspended_at' in profile)) patch.suspended_at = null
    if (!('email_verified_at' in profile)) patch.email_verified_at = authUser?.emailVerified ? nowIso() : null

    if (!authUser) {
        patch.status = 'suspended'
    } else if (isBootstrapAdmin) {
        patch.role = 'admin'
        patch.requested_role = 'admin'
        patch.status = 'active'
    } else if (profile.role === 'faculty' || requestedRole === 'faculty') {
        patch.role = 'faculty'
        patch.requested_role = 'faculty'
        patch.status = profile.status === 'active' && authUser.emailVerified ? 'active' : 'pending_approval'
    } else {
        patch.role = 'student'
        patch.requested_role = 'student'
        patch.status = authUser.emailVerified ? 'active' : 'active'
    }

    for (const field of ['phone', 'register_number', 'specialization', 'year_of_passout']) {
        if (!(field in profile)) patch[field] = ''
    }

    if (!profile.updated_at) patch.updated_at = nowIso()

    return { profile, authUser, patch }
}

const main = async () => {
    const profileSnapshot = await db.collection('profiles').get()
    const report = {
        dryRun,
        profileCount: profileSnapshot.size,
        updates: [],
        warnings: [],
    }

    for (const doc of profileSnapshot.docs) {
        const { profile, authUser, patch } = await buildProfilePatch(doc)
        if (!authUser) {
            report.warnings.push({ type: 'missing_auth_user', uid: doc.id, email: profile.email || null })
        }
        if (Object.keys(patch).length > 0) {
            report.updates.push({ uid: doc.id, email: profile.email || null, patch })
            if (!dryRun) await doc.ref.set(patch, { merge: true })
        }
    }

    const bookings = await db.collection('bookings').get()
    for (const doc of bookings.docs) {
        const booking = { id: doc.id, ...doc.data() }
        if (!booking.machine_id || !booking.student_id || !booking.booking_date || !booking.start_time || !booking.end_time) {
            report.warnings.push({ type: 'invalid_booking_shape', bookingId: doc.id })
        }
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

main().catch((err) => {
    console.error(err)
    process.exitCode = 1
})
