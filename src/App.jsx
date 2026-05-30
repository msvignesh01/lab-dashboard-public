import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import Dashboard from '@/pages/Dashboard'
import Login from '@/pages/LoginPage'
import Signup from '@/pages/SignupPage'
import MachinesPage from '@/pages/MachinesPage'
import BookingsPage from '@/pages/BookingsPage'
import AdminDashboard from '@/pages/AdminDashboard'
import ErrorBoundary from '@/components/ErrorBoundary'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import {
  LoadingGate,
  PendingApprovalGate,
  ProfileErrorGate,
  SuspendedGate,
  VerifyEmailGate,
} from '@/components/auth/AccountGate'

function ProtectedRoute({ children, role }) {
  const { user, profile, loading, profileLoading, profileError, accessState } = useAuth()

  if (loading) return <LoadingGate />
  if (!user) return <Navigate to="/login" replace />

  if (accessState === 'email_unverified') return <VerifyEmailGate />
  if (profileLoading) return <LoadingGate message="Loading your account..." />
  if (accessState === 'pending_approval') return <PendingApprovalGate />
  if (accessState === 'suspended' || accessState === 'profile_inactive') return <SuspendedGate />
  if (accessState === 'profile_error' || accessState === 'profile_missing') {
    return <ProfileErrorGate message={profileError?.message || 'We could not load your account profile.'} />
  }

  if (role) {
    const allowedRoles = Array.isArray(role) ? role : [role]
    if (!allowedRoles.includes(profile.role)) {
      return <Navigate to="/" replace />
    }
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingGate />
  if (user) return <Navigate to="/" replace />

  return children
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={
              <PublicRoute>
                <Login />
              </PublicRoute>
            } />
            <Route path="/signup" element={
              <PublicRoute>
                <Signup />
              </PublicRoute>
            } />

            <Route path="/" element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } />

            <Route path="/machines" element={
              <ProtectedRoute>
                <MachinesPage />
              </ProtectedRoute>
            } />

            <Route path="/bookings" element={
              <ProtectedRoute>
                <BookingsPage />
              </ProtectedRoute>
            } />

            <Route path="/admin" element={
              <ProtectedRoute role={['faculty', 'admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster
            position="top-right"
            offset={16}
            mobileOffset={16}
            expand
            closeButton
            richColors
            duration={4000}
            toastOptions={{
              className: 'shadow-lg',
            }}
          />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
