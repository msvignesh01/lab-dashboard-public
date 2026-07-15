import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { pathToFileURL } from 'node:url'
import {
    getBookingLockBuckets,
    getBookingLockId,
    getSlotId,
    getSlotMinutes,
} from '../server/_lib/bookingPolicy.js'
import {
    getInstitutionalRole,
    normalizeInstitutionalEmail,
} from '../server/_lib/profilePolicy.js'
import {
    fromFirestoreDocument,
    hasStoredDocumentIdMismatch,
} from '../server/_lib/firestoreData.js'

const dryRun = !process.argv.includes('--apply')
const nowIso = () => new Date().toISOString()
const maskEmail = (email) => {
    const value = normalizeEmail(email)
    if (!value || !value.includes('@')) return null
    return value.replace(/(.{2})[^@]*@/, '$1***@')
}

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n')
const normalizeEmail = normalizeInstitutionalEmail

const DOCUMENT_ID_WARNING_KEYS = {
    profile: 'uid',
    machine: 'machineId',
    booking: 'bookingId',
}

export const buildDocumentIdMismatchWarning = (snapshot, entityType) => {
    const key = DOCUMENT_ID_WARNING_KEYS[entityType]
    if (!key || !hasStoredDocumentIdMismatch(snapshot)) return null
    return {
        type: `${entityType}_document_id_mismatch`,
        [key]: snapshot.id,
    }
}

const required = (name) => {
    const value = process.env[name]
    if (!value) throw new Error(`Missing ${name}`)
    return value
}

let auth
let db
let bootstrapAdmins = new Set()

const initializeServices = () => {
    const projectId = required('FIREBASE_ADMIN_PROJECT_ID')
    const app = initializeApp({
        credential: cert({
            projectId,
            clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL'),
            privateKey: normalizePrivateKey(required('FIREBASE_ADMIN_PRIVATE_KEY')),
        }),
        projectId,
    })

    auth = getAuth(app)
    db = getFirestore(app)
    bootstrapAdmins = new Set(
        String(process.env.BOOTSTRAP_ADMIN_EMAILS || '')
            .split(',')
            .map(normalizeEmail)
            .filter(Boolean),
    )
}

export const lockDocumentContainsBooking = (lock, bookingId) => {
    if (!lock || typeof lock !== 'object' || typeof bookingId !== 'string' || !bookingId) return false

    // Version 1 stored the booking identity at the document root.
    if (lock.booking_id === bookingId) return true

    if (
        lock.schema_version !== 2
        || !lock.reservations
        || typeof lock.reservations !== 'object'
        || Array.isArray(lock.reservations)
    ) {
        return false
    }

    const reservation = lock.reservations[bookingId]
    return Boolean(
        reservation
        && typeof reservation === 'object'
        && !Array.isArray(reservation)
        && reservation.booking_id === bookingId,
    )
}

export const hasActiveBookingLock = async ({ firestore, booking }) => {
    const bookingSlots = firestore.collection('booking_slots')
    const bucketMinutes = getBookingLockBuckets(booking)

    if (bucketMinutes.length > 0) {
        const lockRefs = bucketMinutes.map((bucketMinute) => (
            bookingSlots.doc(getBookingLockId(booking, bucketMinute))
        ))
        const lockSnapshots = await firestore.getAll(...lockRefs)
        const version2Checks = lockSnapshots.map((snapshot) => {
            const lock = snapshot.exists ? snapshot.data() : null
            const reservations = lock?.schema_version === 2
                && lock.reservations
                && typeof lock.reservations === 'object'
                && !Array.isArray(lock.reservations)
                ? lock.reservations
                : null
            const referencesBooking = Boolean(
                reservations
                && Object.prototype.hasOwnProperty.call(reservations, booking.id),
            )
            return {
                referencesBooking,
                valid: referencesBooking && lockDocumentContainsBooking(lock, booking.id),
            }
        })

        if (version2Checks.every(({ valid }) => valid)) return true
        // Once any deterministic bucket references this booking, a partial or
        // malformed v2 lock set is corruption. Do not mask it with legacy data.
        if (version2Checks.some(({ referencesBooking }) => referencesBooking)) return false
    }

    // Keep the version-1 lookup so bookings created before the bucket-lock
    // cutover are not reported as missing their active lock documents.
    const legacySlots = await bookingSlots
        .where('booking_id', '==', booking.id)
        .get()
    const expectedLegacyIds = getSlotMinutes(booking).map((minute) => getSlotId(booking, minute))
    if (expectedLegacyIds.length === 0 || legacySlots.empty) return false

    const legacyIds = new Set(
        legacySlots.docs
            .filter((snapshot) => lockDocumentContainsBooking(snapshot.data(), booking.id))
            .map((snapshot) => snapshot.id),
    )
    return expectedLegacyIds.every((id) => legacyIds.has(id))
}

const inferRequestedRole = (profile) => {
    if (profile.requested_role) return profile.requested_role
    if (profile.role === 'admin') return 'admin'
    if (profile.role === 'faculty') return 'faculty'
    return 'student'
}

const getAuthUser = async (uid) => {
    try {
        return await auth.getUser(uid)
    } catch (error) {
        if (error?.code === 'auth/user-not-found') return null
        throw error
    }
}

const getIdentityFindings = ({ profile, authUser }) => {
    const findings = []
    const profileEmail = normalizeEmail(profile.email)
    const authEmail = normalizeEmail(authUser?.email)
    const base = {
        uid: profile.id,
        authEmail: maskEmail(authEmail),
        profileEmail: maskEmail(profileEmail),
    }

    if (!authUser) {
        findings.push({ type: 'missing_auth_user', ...base })
    }

    const authInstitutionalRole = getInstitutionalRole(authEmail)
    const profileInstitutionalRole = getInstitutionalRole(profileEmail)
    if (authUser && !authInstitutionalRole) {
        findings.push({ type: 'unsupported_auth_email_domain', ...base })
    }
    if (authUser?.disabled === true) {
        findings.push({ type: 'disabled_auth_user', ...base })
    }
    if (!profileInstitutionalRole) {
        findings.push({ type: 'unsupported_profile_email_domain', ...base })
    }
    if (authEmail && profileEmail && authEmail !== profileEmail) {
        findings.push({ type: 'token_auth_profile_email_mismatch', ...base })
    }

    if (profileInstitutionalRole) {
        const roleAllowed = profileInstitutionalRole === 'student'
            ? profile.role === 'student'
            : profile.role === 'faculty' || profile.role === 'admin'
        if (!roleAllowed) {
            findings.push({
                type: 'profile_role_email_domain_mismatch',
                role: profile.role || null,
                expectedDomainRole: profileInstitutionalRole,
                ...base,
            })
        }
    }

    if (authUser && authUser.emailVerified !== true && profile.email_verified_at) {
        findings.push({ type: 'auth_profile_verification_mismatch', ...base })
    }
    return findings
}

const buildProfilePatch = async (doc) => {
    const profile = fromFirestoreDocument(doc)
    const authUser = await getAuthUser(doc.id)
    const authEmail = normalizeEmail(authUser?.email)
    const identityFindings = getIdentityFindings({ profile, authUser })
    const identityValid = identityFindings.length === 0
    const isBootstrapAdmin = identityValid
        && bootstrapAdmins.has(authEmail)
        && getInstitutionalRole(authEmail) === 'faculty'
        && authUser?.emailVerified === true
    const requestedRole = isBootstrapAdmin ? 'admin' : inferRequestedRole(profile)
    const patch = {}
    const timestamp = nowIso()
    const setIfChanged = (field, value) => {
        if (profile[field] !== value) patch[field] = value
    }

    if (!profile.requested_role) setIfChanged('requested_role', requestedRole)
    if (!('approved_by' in profile)) patch.approved_by = isBootstrapAdmin ? doc.id : null
    if (!('approved_at' in profile)) patch.approved_at = isBootstrapAdmin ? timestamp : null
    if (!('suspended_at' in profile)) patch.suspended_at = identityValid ? null : timestamp
    else if (!identityValid && !profile.suspended_at) patch.suspended_at = timestamp
    if (!('email_verified_at' in profile)) {
        patch.email_verified_at = identityValid && authUser?.emailVerified ? timestamp : null
    }

    if (!identityValid) {
        setIfChanged('status', 'suspended')
    } else if (isBootstrapAdmin) {
        setIfChanged('role', 'admin')
        setIfChanged('requested_role', 'admin')
        setIfChanged('status', 'active')
    } else if (profile.role === 'admin') {
        setIfChanged('role', 'admin')
        setIfChanged('requested_role', 'admin')
        setIfChanged('status', profile.status === 'active' && authUser.emailVerified
            ? 'active'
            : profile.status === 'suspended' ? 'suspended' : 'pending_approval')
    } else if (profile.role === 'faculty' || requestedRole === 'faculty') {
        setIfChanged('role', 'faculty')
        setIfChanged('requested_role', 'faculty')
        setIfChanged('status', profile.status === 'suspended'
            ? 'suspended'
            : profile.status === 'active' && authUser.emailVerified ? 'active' : 'pending_approval')
    } else {
        setIfChanged('role', 'student')
        setIfChanged('requested_role', 'student')
        setIfChanged('status', profile.status === 'suspended' ? 'suspended' : 'active')
    }

    for (const field of ['phone', 'register_number', 'specialization', 'year_of_passout']) {
        if (!(field in profile)) patch[field] = ''
    }

    if (Object.keys(patch).length > 0) patch.updated_at = timestamp

    return { profile, authUser, patch, identityFindings }
}

const main = async () => {
    initializeServices()

    const profileSnapshot = await db.collection('profiles').get()
    const report = {
        dryRun,
        profileCount: profileSnapshot.size,
        updates: [],
        warnings: [],
        identityFindings: [],
    }

    for (const doc of profileSnapshot.docs) {
        const idWarning = buildDocumentIdMismatchWarning(doc, 'profile')
        if (idWarning) report.warnings.push(idWarning)
        const { profile, patch, identityFindings } = await buildProfilePatch(doc)
        report.identityFindings.push(...identityFindings)
        if (Object.keys(patch).length > 0) {
            report.updates.push({ uid: doc.id, email: maskEmail(profile.email), patch })
            if (!dryRun) await doc.ref.set(patch, { merge: true })
        }
    }

    const labConfigRef = db.collection('lab_config').doc('default')
    const labConfigSnap = await labConfigRef.get()
    if (!labConfigSnap.exists) {
        const defaultLabConfig = {
            id: 'default',
            timezone: 'Asia/Kolkata',
            timezone_offset_minutes: 330,
            open_time: '09:00:00',
            close_time: '18:00:00',
            active_weekdays: [1, 2, 3, 4, 5, 6],
            max_advance_days: 30,
            max_duration_hours: 8,
            updated_at: nowIso(),
            updated_by: 'migration',
        }
        report.updates.push({ type: 'lab_config_default', patch: defaultLabConfig })
        if (!dryRun) await labConfigRef.set(defaultLabConfig)
    }

    const machines = await db.collection('machines').get()
    for (const doc of machines.docs) {
        const idWarning = buildDocumentIdMismatchWarning(doc, 'machine')
        if (idWarning) report.warnings.push(idWarning)
        const machine = fromFirestoreDocument(doc)
        const patch = {}
        if (!('requires_training' in machine)) patch.requires_training = false
        if (!('specifications' in machine) || typeof machine.specifications !== 'object' || Array.isArray(machine.specifications)) patch.specifications = {}
        if (Object.keys(patch).length > 0) {
            patch.updated_at = nowIso()
            report.updates.push({ type: 'machine_shape', machineId: doc.id, patch })
            if (!dryRun) await doc.ref.set(patch, { merge: true })
        }
    }

    const bookings = await db.collection('bookings').get()
    for (const doc of bookings.docs) {
        const idWarning = buildDocumentIdMismatchWarning(doc, 'booking')
        if (idWarning) report.warnings.push(idWarning)
        const booking = fromFirestoreDocument(doc)
        if (!booking.machine_id || !booking.student_id || !booking.booking_date || !booking.start_time || !booking.end_time) {
            report.warnings.push({ type: 'invalid_booking_shape', bookingId: doc.id })
        }
        if (['pending', 'approved'].includes(booking.status)) {
            if (!(await hasActiveBookingLock({ firestore: db, booking }))) {
                report.warnings.push({ type: 'missing_active_booking_slots', bookingId: doc.id })
            }
        }
    }

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

const isDirectRun = Boolean(process.argv[1])
    && import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
    main().catch((err) => {
        console.error(err)
        process.exitCode = 1
    })
}
