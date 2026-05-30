import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

const requiredConfigKeys = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId',
]

const missingConfigKeys = requiredConfigKeys.filter((key) => !firebaseConfig[key])

if (missingConfigKeys.length > 0) {
    const errorMsg = 'Application configuration is unavailable.'
    console.error(errorMsg)
    throw new Error(errorMsg)
}

if (!/^[a-z0-9-]+$/i.test(firebaseConfig.projectId)) {
    throw new Error('Application configuration is invalid.')
}

try {
    new URL(`https://${firebaseConfig.authDomain}`)
} catch {
    throw new Error('Application configuration is invalid.')
}

export const firebaseApp = initializeApp(firebaseConfig)
export const firebaseAuth = getAuth(firebaseApp)
export const firestore = getFirestore(firebaseApp)
export const firebaseProjectId = firebaseConfig.projectId
