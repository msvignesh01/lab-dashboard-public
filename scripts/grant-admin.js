// One-off, audited administrator grant.
//
// Dry run:
//   node scripts/grant-admin.js faculty.member@christuniversity.in
// Apply (the actor must already be an active administrator):
//   node scripts/grant-admin.js faculty.member@christuniversity.in --apply --actor-uid <active-admin-uid>

import { randomUUID } from 'node:crypto'
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { EMAIL_DOMAINS } from '../shared/constants.js'
import { isValidFirestoreId } from '../server/_lib/ids.js'

const normalizeEmail = (value) => String(value || '').trim().toLowerCase()
const targetEmail = normalizeEmail(process.argv[2])
const apply = process.argv.includes('--apply')

const readOption = (name) => {
    const assignment = process.argv.find((argument) => argument.startsWith(`${name}=`))
    if (assignment) return assignment.slice(name.length + 1).trim()
    const index = process.argv.indexOf(name)
    return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

const actorUid = readOption('--actor-uid')

if (!targetEmail || !targetEmail.includes('@')) {
    console.error('Usage: node scripts/grant-admin.js <faculty-email> [--apply --actor-uid <active-admin-uid>]')
    process.exit(1)
}
if (apply && !isValidFirestoreId(actorUid)) {
    console.error('Applying an admin grant requires --actor-uid with an existing active administrator UID.')
    process.exit(1)
}

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n')
const required = (name) => {
    const value = process.env[name]
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
    return value
}

const projectId = required('FIREBASE_ADMIN_PROJECT_ID')

const app = initializeApp({
    credential: cert({
        projectId,
        clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL'),
        privateKey: normalizePrivateKey(required('FIREBASE_ADMIN_PRIVATE_KEY')),
    }),
    projectId,
})

const auth = getAuth(app)
const db = getFirestore(app)

const isFacultyEmail = (email) => {
    return /^[A-Za-z0-9._-]{2,50}@[A-Za-z0-9.-]+$/u.test(email)
        && email.endsWith(EMAIL_DOMAINS.FACULTY)
}

const assertVerifiedFacultyAuthUser = (userRecord, expectedEmail, label) => {
    const authEmail = normalizeEmail(userRecord?.email)
    if (!authEmail || authEmail !== expectedEmail) {
        throw new Error(`${label} Firebase Auth email does not match the requested identity.`)
    }
    if (!isFacultyEmail(authEmail)) {
        throw new Error(`${label} must use the supported faculty email domain (${EMAIL_DOMAINS.FACULTY}).`)
    }
    if (userRecord.emailVerified !== true) {
        throw new Error(`${label} Firebase Auth email is not verified. Verify it through the normal authentication flow first.`)
    }
    if (userRecord.disabled === true) {
        throw new Error(`${label} Firebase Auth account is disabled.`)
    }
    return authEmail
}

const assertExistingTargetIdentity = (profile, uid, email) => {
    if (!profile) return
    if (profile.id && profile.id !== uid) {
        throw new Error('The existing target profile contains a conflicting UID. No changes were made.')
    }
    if (normalizeEmail(profile.email) !== email) {
        throw new Error('The existing target profile email conflicts with Firebase Auth. No changes were made.')
    }
    if (!['faculty', 'admin'].includes(profile.role)) {
        throw new Error('The existing target profile role conflicts with its faculty-domain identity. No changes were made.')
    }
}

const assertActiveAdminActor = async ({ uid, transaction = null }) => {
    if (!isValidFirestoreId(uid)) throw new Error('A valid active administrator actor UID is required.')

    let actorAuth
    try {
        actorAuth = await auth.getUser(uid)
    } catch (error) {
        if (error?.code === 'auth/user-not-found') {
            throw new Error(`No Firebase Auth user exists for actor UID ${uid}.`)
        }
        throw error
    }

    const actorEmail = normalizeEmail(actorAuth.email)
    assertVerifiedFacultyAuthUser(actorAuth, actorEmail, 'The actor')

    const actorRef = db.collection('profiles').doc(uid)
    const actorSnapshot = transaction
        ? await transaction.get(actorRef)
        : await actorRef.get()
    if (!actorSnapshot.exists) throw new Error('The actor does not have an application profile.')

    const actorProfile = { ...actorSnapshot.data(), id: actorSnapshot.id }
    if (actorProfile.role !== 'admin' || actorProfile.status !== 'active') {
        throw new Error('The actor profile is not an active administrator.')
    }
    if (normalizeEmail(actorProfile.email) !== actorEmail) {
        throw new Error('The actor profile email conflicts with Firebase Auth.')
    }
    return { actorEmail, actorProfile }
}

const buildAdminProfile = ({ userRecord, existingProfile, approvedBy, now }) => {
    const uid = userRecord.uid
    const email = normalizeEmail(userRecord.email)
    const profile = {
        ...(existingProfile || {}),
        role: 'admin',
        requested_role: 'admin',
        status: 'active',
        approved_by: approvedBy,
        approved_at: now,
        suspended_at: null,
        email_verified_at: existingProfile?.email_verified_at || now,
        updated_at: now,
    }

    if (!existingProfile) {
        Object.assign(profile, {
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
    return profile
}

const getTargetAuthUser = async () => {
    let userRecord
    try {
        userRecord = await auth.getUserByEmail(targetEmail)
    } catch (error) {
        if (error?.code === 'auth/user-not-found') {
            throw new Error(`No Firebase Auth user exists for ${targetEmail}. Ask the person to sign up and verify their email first.`)
        }
        throw error
    }
    if (!isValidFirestoreId(userRecord.uid)) {
        throw new Error('The target Firebase Auth UID cannot be represented by the application profile store.')
    }
    assertVerifiedFacultyAuthUser(userRecord, targetEmail, 'The target')
    return userRecord
}

const main = async () => {
    const targetAuthUser = await getTargetAuthUser()
    const targetRef = db.collection('profiles').doc(targetAuthUser.uid)

    if (apply && actorUid === targetAuthUser.uid) {
        throw new Error('The approving administrator must be different from the target account.')
    }

    if (!apply) {
        const snapshot = await targetRef.get()
        const existingProfile = snapshot.exists ? { ...snapshot.data(), id: snapshot.id } : null
        assertExistingTargetIdentity(existingProfile, targetAuthUser.uid, targetEmail)
        const preview = buildAdminProfile({
            userRecord: targetAuthUser,
            existingProfile,
            approvedBy: '<required-active-admin-uid>',
            now: '<transaction-time>',
        })
        process.stdout.write(`[dry-run] Admin grant for ${targetEmail} (uid: ${targetAuthUser.uid})\n`)
        process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`)
        process.stdout.write('\nDry run only. Re-run with --apply --actor-uid <active-admin-uid>.\n')
        return
    }

    const result = await db.runTransaction(async (transaction) => {
        const { actorEmail } = await assertActiveAdminActor({ uid: actorUid, transaction })
        const targetSnapshot = await transaction.get(targetRef)
        const existingProfile = targetSnapshot.exists
            ? { ...targetSnapshot.data(), id: targetSnapshot.id }
            : null
        assertExistingTargetIdentity(existingProfile, targetAuthUser.uid, targetEmail)

        const now = new Date().toISOString()
        const profile = buildAdminProfile({
            userRecord: targetAuthUser,
            existingProfile,
            approvedBy: actorUid,
            now,
        })
        const auditId = randomUUID()
        const auditRef = db.collection('audit_log').doc(auditId)
        const auditRecord = {
            id: auditId,
            action: 'admin.role_granted',
            entity_type: 'profile',
            entity_id: targetAuthUser.uid,
            actor_uid: actorUid,
            actor_role: 'admin',
            metadata: {
                target_email: targetEmail,
                actor_email: actorEmail,
                previous_role: existingProfile?.role || null,
                previous_status: existingProfile?.status || null,
                created: !existingProfile,
            },
            created_at: now,
        }

        transaction.set(targetRef, profile)
        transaction.set(auditRef, auditRecord)
        return { profile, auditId }
    })

    process.stdout.write(`Applied admin grant for ${targetEmail} (uid: ${targetAuthUser.uid}).\n`)
    process.stdout.write(`Audit record: ${result.auditId}; actor UID: ${actorUid}.\n`)
    process.stdout.write('The user may need to sign out and back in before the new role is reflected.\n')
}

main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
})
