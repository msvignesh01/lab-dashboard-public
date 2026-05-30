import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const missingFirebaseConfig = !import.meta.env.VITE_FIREBASE_API_KEY ||
  !import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ||
  !import.meta.env.VITE_FIREBASE_PROJECT_ID ||
  !import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ||
  !import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
  !import.meta.env.VITE_FIREBASE_APP_ID

if (missingFirebaseConfig) {
  createRoot(rootElement).render(
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <div>
        <h1 style={{ color: '#dc2626', marginBottom: '12px' }}>App Unavailable</h1>
        <p style={{ margin: 0, color: '#1f2937' }}>
          The app is not available in this environment. Please contact the administrator.
        </p>
      </div>
    </div>,
  )
} else {
  import('./App.jsx').then((module) => {
    const AppComponent = module.default

    createRoot(rootElement).render(
      <StrictMode>
        <AppComponent />
      </StrictMode>,
    )
  })
}
