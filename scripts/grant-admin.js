// One-off admin grant: sets a user's Firestore profile to role=admin, status=active.
//
// This changes DATA in Firestore only — it does NOT hardcode anything in app code.
//
// Usage (dry run, prints the change without writing):
//   node scripts/grant-admin.js john.silvister@christuniversity.in
// Apply it for real:
//   node scripts/grant-admin.js john.silvister@christuniversity.in --apply
//
// Requires the same Firebase Admin credentials the server uses, available as env vars
// (FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY,
// or the GCP_* fallbacks). Load them however you prefer, e.g. on PowerShell:
//   $env:FIREBASE_ADMIN_PROJECT_ID="lab-dashboard-2809"; node scripts/grant-admin.js <email> --apply

import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const email = String(process.argv[2] || '').trim().toLowerCase()
const apply = process.argv.includes('--apply')

if (!email || !email.includes('@')) {
    console.error('Usage: node scripts/grant-admin.js <email> [--apply]')
    process.exit(1)
}

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

if (!projectId) throw new Error('Missing required environment variable: FIREBASE_ADMIN_PROJECT_ID')

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

const main = async () => {
    let userRecord
    try {
        userRecord = await auth.getUserByEmail(email)
    } catch {
        console.error(`No Firebase Auth user exists for ${email}.`)
        console.error('Ask the person to sign up and verify their email first, then re-run this script.')
        process.exit(1)
    }

    const uid = userRecord.uid
    const ref = db.collection('profiles').doc(uid)
    const snap = await ref.get()
    const now = new Date().toISOString()

    const patch = {
        role: 'admin',
        requested_role: 'admin',
        status: 'active',
        approved_by: uid,
        approved_at: now,
        suspended_at: null,
        email_verified_at: snap.exists ? (snap.data().email_verified_at || now) : now,
        updated_at: now,
    }

    if (!snap.exists) {
        Object.assign(patch, {
            id: uid,
            email,
            full_name: userRecord.displayName || email,
            department: 'Administration',
            phone: '',
            register_number: '',
            specialization: '',
            year_of_passout: '',
            created_at: now,
        })
    }

    process.stdout.write(`${apply ? 'Applying' : '[dry-run]'} admin grant for ${email} (uid: ${uid})\n`)
    process.stdout.write(`${JSON.stringify(patch, null, 2)}\n`)

    if (!apply) {
        process.stdout.write('\nDry run only. Re-run with --apply to write to Firestore.\n')
        return
    }

    // An admin must have a verified email to get past the app's account gate, so
    // ensure the Auth record is verified as part of provisioning.
    if (!userRecord.emailVerified) {
        await auth.updateUser(uid, { emailVerified: true })
        process.stdout.write('Marked the Auth email as verified (admins must be verified to sign in).\n')
    }

    await ref.set(patch, { merge: true })
    process.stdout.write('\nDone. The user now has admin access. They may need to sign out and back in.\n')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
