import { ApiError, getBearerToken, sendError } from './_lib/http.js'

// Fixed-literal dynamic imports keep route loading lazy without allowing any
// user-controlled module path. This lets the facade reject unknown or
// unauthenticated requests before Firebase Admin configuration is touched.
const loaders = {
    auditLog: () => import('./_routes/audit-log/index.js'),
    bookings: () => import('./_routes/bookings/index.js'),
    cancelBooking: () => import('./_routes/bookings/[bookingId]/cancel.js'),
    reviewBooking: () => import('./_routes/bookings/[bookingId]/review.js'),
    labConfig: () => import('./_routes/lab-config/index.js'),
    machines: () => import('./_routes/machines/index.js'),
    machineDetails: () => import('./_routes/machines/[machineId].js'),
    machineAvailability: () => import('./_routes/machines/[machineId]/availability.js'),
    maintenanceWindows: () => import('./_routes/maintenance-windows/index.js'),
    maintenanceWindowDetails: () => import('./_routes/maintenance-windows/[windowId].js'),
    notifications: () => import('./_routes/notifications/index.js'),
    facultyRequests: () => import('./_routes/profile/faculty-requests.js'),
    profileMe: () => import('./_routes/profile/me.js'),
    registerProfile: () => import('./_routes/profile/register.js'),
    approveProfile: () => import('./_routes/profile/[userId]/approve.js'),
    rejectProfile: () => import('./_routes/profile/[userId]/reject.js'),
    trainingRecords: () => import('./_routes/training-records/index.js'),
    users: () => import('./_routes/users/index.js'),
    updateUserRole: () => import('./_routes/users/[userId]/role.js'),
    updateUserStatus: () => import('./_routes/users/[userId]/status.js'),
}

const route = (loader, params = {}) => ({ loader, params })

const withParams = (req, params) => {
    req.query = {
        ...(req.query || {}),
        ...params,
    }
    return req
}

const toPathParts = (value) => {
    const parts = String(value || '')
        .split('/')
        .filter(Boolean)
    try {
        return parts.map((part) => decodeURIComponent(part))
    } catch {
        return []
    }
}

const getPathParts = (req) => {
    const url = new URL(req.url || '/', 'https://local.invalid')
    const rewrittenPath = req.query?.path || url.searchParams.get('path')
    if (Array.isArray(rewrittenPath)) return toPathParts(rewrittenPath.join('/'))
    if (rewrittenPath) return toPathParts(rewrittenPath)
    return toPathParts(url.pathname.replace(/^\/api\/?/, ''))
}

const resolveRoute = (parts) => {
    const [resource, id, action] = parts

    if (parts.length === 1 && resource === 'audit-log') return route(loaders.auditLog)
    if (parts.length === 1 && resource === 'bookings') return route(loaders.bookings)
    if (parts.length === 3 && resource === 'bookings' && action === 'cancel') return route(loaders.cancelBooking, { bookingId: id })
    if (parts.length === 3 && resource === 'bookings' && action === 'review') return route(loaders.reviewBooking, { bookingId: id })
    if (parts.length === 1 && resource === 'lab-config') return route(loaders.labConfig)
    if (parts.length === 1 && resource === 'machines') return route(loaders.machines)
    if (parts.length === 2 && resource === 'machines') return route(loaders.machineDetails, { machineId: id })
    if (parts.length === 3 && resource === 'machines' && action === 'availability') {
        return route(loaders.machineAvailability, { machineId: id })
    }
    if (parts.length === 1 && resource === 'maintenance-windows') return route(loaders.maintenanceWindows)
    if (parts.length === 2 && resource === 'maintenance-windows') return route(loaders.maintenanceWindowDetails, { windowId: id })
    if (parts.length === 1 && resource === 'notifications') return route(loaders.notifications)
    if (parts.length === 2 && resource === 'profile' && id === 'faculty-requests') return route(loaders.facultyRequests)
    if (parts.length === 2 && resource === 'profile' && id === 'me') return route(loaders.profileMe)
    if (parts.length === 2 && resource === 'profile' && id === 'register') return route(loaders.registerProfile)
    if (parts.length === 3 && resource === 'profile' && action === 'approve') return route(loaders.approveProfile, { userId: id })
    if (parts.length === 3 && resource === 'profile' && action === 'reject') return route(loaders.rejectProfile, { userId: id })
    if (parts.length === 1 && resource === 'training-records') return route(loaders.trainingRecords)
    if (parts.length === 1 && resource === 'users') return route(loaders.users)
    if (parts.length === 3 && resource === 'users' && action === 'role') return route(loaders.updateUserRole, { userId: id })
    if (parts.length === 3 && resource === 'users' && action === 'status') return route(loaders.updateUserStatus, { userId: id })

    return null
}

export const createApiHandler = ({ resolveRouteImpl = resolveRoute } = {}) => async (req, res) => {
    try {
        const match = resolveRouteImpl(getPathParts(req))
        if (!match) {
            throw new ApiError(404, 'API route not found.', 'not_found')
        }

        // Every route in this facade is private. Route handlers still verify
        // the token and enforce profile/role policy after this cheap preflight.
        getBearerToken(req)
        const routeModule = await match.loader()
        return routeModule.default(withParams(req, match.params), res)
    } catch (error) {
        if (!(error instanceof ApiError)) {
            console.error('[api:dispatch]', error?.message || error)
        }
        return sendError(res, error)
    }
}

export default createApiHandler()
