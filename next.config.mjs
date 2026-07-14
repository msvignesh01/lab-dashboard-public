const firebaseEnvironmentAliases = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", "VITE_FIREBASE_API_KEY"],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_AUTH_DOMAIN"],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", "VITE_FIREBASE_PROJECT_ID"],
  ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "VITE_FIREBASE_STORAGE_BUCKET"],
  ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "VITE_FIREBASE_MESSAGING_SENDER_ID"],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", "VITE_FIREBASE_APP_ID"],
  ["NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID", "VITE_FIREBASE_MEASUREMENT_ID"],
]

// Keep existing deployments working during the environment-variable migration.
// Canonical NEXT_PUBLIC_* values always win and VITE_* aliases can be removed
// after every environment has been migrated.
const legacyFirebaseFallbacks = Object.fromEntries(
  firebaseEnvironmentAliases.flatMap(([canonicalName, legacyName]) => {
    const value = process.env[canonicalName] ?? process.env[legacyName]
    return value ? [[canonicalName, value]] : []
  }),
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: legacyFirebaseFallbacks,
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["firebase-admin"],
}

export default nextConfig
