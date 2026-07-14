import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
}

const requiredConfig = [
  ["apiKey", firebaseConfig.apiKey],
  ["authDomain", firebaseConfig.authDomain],
  ["projectId", firebaseConfig.projectId],
  ["messagingSenderId", firebaseConfig.messagingSenderId],
  ["appId", firebaseConfig.appId],
] as const

function assertConfiguration(): void {
  const missing = requiredConfig.filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) {
    throw new Error("The authentication service is not configured for this deployment.")
  }

  if (!/^[a-z0-9-]+$/i.test(firebaseConfig.projectId ?? "")) {
    throw new Error("The authentication service configuration is invalid.")
  }

  try {
    new URL(`https://${firebaseConfig.authDomain}`)
  } catch {
    throw new Error("The authentication service configuration is invalid.")
  }
}

let app: FirebaseApp | undefined
let auth: Auth | undefined

export function getFirebaseApp(): FirebaseApp {
  if (app) return app
  assertConfiguration()
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  return app
}

export function getFirebaseAuth(): Auth {
  auth ??= getAuth(getFirebaseApp())
  return auth
}

export function getFirebaseConfigurationError(): string | null {
  try {
    assertConfiguration()
    return null
  } catch (error) {
    return error instanceof Error ? error.message : "The authentication service is unavailable."
  }
}
