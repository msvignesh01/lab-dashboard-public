// Read-only diagnostic: prints Firebase Auth + Firestore profile state for emails.
// Helps explain things like "user can't verify their email" or "no admin access".
//   node --env-file=.env.local scripts/inspect-users.mjs [email ...]
// Defaults to the two admin emails when none are passed.
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

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

const emails = process.argv.slice(2).filter((arg) => arg.includes('@'))
const targets = emails.length ? emails : [
    'ms.rishav@btech.christuniversity.in',
    'john.silvister@christuniversity.in',
]

const main = async () => {
    process.stdout.write(`Project: ${projectId}\n\n`)
    for (const email of targets) {
        try {
            const u = await auth.getUserByEmail(email)
            const snap = await db.collection('profiles').doc(u.uid).get()
            const p = snap.exists ? snap.data() : null
            process.stdout.write(`${email}\n`)
            process.stdout.write(`  auth  : uid=${u.uid} emailVerified=${u.emailVerified} disabled=${u.disabled} providers=${(u.providerData || []).map((d) => d.providerId).join(',') || 'none'}\n`)
            process.stdout.write(`  auth  : created=${u.metadata?.creationTime || '?'} lastSignIn=${u.metadata?.lastSignInTime || 'never'}\n`)
            if (p) {
                process.stdout.write(`  profile: role=${p.role} status=${p.status} requested_role=${p.requested_role} email_verified_at=${p.email_verified_at || 'null'}\n`)
            } else {
                process.stdout.write('  profile: NONE (no Firestore profile document)\n')
            }
        } catch (err) {
            process.stdout.write(`${email}\n  NOT FOUND in Firebase Auth (${err?.errorInfo?.code || err?.code || 'auth/user-not-found'})\n`)
        }
        process.stdout.write('\n')
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
