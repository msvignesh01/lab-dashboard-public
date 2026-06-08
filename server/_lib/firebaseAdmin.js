import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const normalizePrivateKey = (key) => {
    if (!key || typeof key !== 'string') return ''
    return key.replace(/\\n/g, '\n')
}

const getRequiredEnv = (name, fallbackName) => {
    const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '')
    if (!value) {
        throw new Error(`Missing required server environment variable: ${name}`)
    }
    return value
}

const createAdminApp = () => {
    if (getApps().length > 0) return getApps()[0]

    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
        || process.env.GOOGLE_CLOUD_PROJECT
        || process.env.GCLOUD_PROJECT
        || process.env.VITE_FIREBASE_PROJECT_ID

    if (!projectId) {
        throw new Error('Missing required server environment variable: FIREBASE_ADMIN_PROJECT_ID')
    }

    const clientEmail = getRequiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL', 'GCP_CLIENT_EMAIL')
    const privateKey = normalizePrivateKey(getRequiredEnv('FIREBASE_ADMIN_PRIVATE_KEY', 'GCP_PRIVATE_KEY'))

    return initializeApp({
        credential: cert({
            projectId,
            clientEmail,
            privateKey,
        }),
        projectId,
    })
}

export const firebaseAdminApp = createAdminApp()
export const adminAuth = getAuth(firebaseAdminApp)
export const adminDb = getFirestore(firebaseAdminApp)
export { FieldValue }
