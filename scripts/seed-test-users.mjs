// Seeds (or deletes) clearly-labeled end-to-end TEST accounts in the real Firebase
// project, each pre-verified with a known password so they can be used to sign in.
// DEV/TEST ONLY.
//
//   npm run seed:e2e            # create/update the three test users
//   npm run seed:e2e -- --delete  # remove them and their profiles
//
// Override the shared password with E2E_TEST_PASSWORD if you like.
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const remove = process.argv.includes('--delete')
const PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2eTest!2026'

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n')
const required = (name, fallback) => {
    const value = process.env[name] || (fallback ? process.env[fallback] : '')
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
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
const now = () => new Date().toISOString()

const users = [
    { key: 'admin', email: 'e2e-admin@christuniversity.in', role: 'admin', department: 'Administration' },
    { key: 'faculty', email: 'e2e-faculty@christuniversity.in', role: 'faculty', department: 'CSE' },
    { key: 'student', email: 'e2e-student@btech.christuniversity.in', role: 'student', department: 'CSE' },
]

const buildProfile = (uid, u) => ({
    id: uid,
    email: u.email,
    full_name: `E2E ${u.key}`,
    role: u.role,
    requested_role: u.role,
    status: 'active',
    department: u.department,
    phone: u.role === 'student' ? '+910000000000' : '',
    register_number: u.role === 'student' ? '2199999' : '',
    specialization: u.role === 'student' ? 'Testing' : '',
    year_of_passout: u.role === 'student' ? '2027' : '',
    approved_by: uid,
    approved_at: now(),
    suspended_at: null,
    email_verified_at: now(),
    created_at: now(),
    updated_at: now(),
})

const main = async () => {
    for (const u of users) {
        let record = null
        try { record = await auth.getUserByEmail(u.email) } catch { record = null }

        if (remove) {
            if (record) {
                await db.collection('profiles').doc(record.uid).delete().catch(() => {})
                await auth.deleteUser(record.uid)
                process.stdout.write(`deleted ${u.email}\n`)
            }
            continue
        }

        if (!record) {
            record = await auth.createUser({ email: u.email, password: PASSWORD, emailVerified: true, displayName: `E2E ${u.key}` })
        } else {
            await auth.updateUser(record.uid, { password: PASSWORD, emailVerified: true })
        }
        await db.collection('profiles').doc(record.uid).set(buildProfile(record.uid, u), { merge: true })
        process.stdout.write(`ready ${u.role}: ${u.email}  (password: ${PASSWORD})\n`)
    }
    if (!remove) process.stdout.write('\nSign in with these accounts in the dev server to test each role.\n')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
