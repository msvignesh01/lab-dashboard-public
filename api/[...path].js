import { ApiError, sendError } from '../server/_lib/http.js'
import auditLog from '../server/_routes/audit-log/index.js'
import bookings from '../server/_routes/bookings/index.js'
import cancelBooking from '../server/_routes/bookings/[bookingId]/cancel.js'
import reviewBooking from '../server/_routes/bookings/[bookingId]/review.js'
import internalSync from '../server/_routes/internal/sync.js'
import labConfig from '../server/_routes/lab-config/index.js'
import machines from '../server/_routes/machines/index.js'
import machineDetails from '../server/_routes/machines/[machineId].js'
import machineAvailability from '../server/_routes/machines/[machineId]/availability.js'
import maintenanceWindows from '../server/_routes/maintenance-windows/index.js'
import maintenanceWindowDetails from '../server/_routes/maintenance-windows/[windowId].js'
import notifications from '../server/_routes/notifications/index.js'
import facultyRequests from '../server/_routes/profile/faculty-requests.js'
import profileMe from '../server/_routes/profile/me.js'
import approveProfile from '../server/_routes/profile/[userId]/approve.js'
import rejectProfile from '../server/_routes/profile/[userId]/reject.js'
import trainingRecords from '../server/_routes/training-records/index.js'
import users from '../server/_routes/users/index.js'
import updateUserRole from '../server/_routes/users/[userId]/role.js'
import updateUserStatus from '../server/_routes/users/[userId]/status.js'

const route = (handler, params = {}) => ({ handler, params })

const withParams = (req, params) => {
    req.query = {
        ...(req.query || {}),
        ...params,
    }
    return req
}

const getPathParts = (req) => {
    const url = new URL(req.url || '/', 'https://local.invalid')
    return url.pathname
        .replace(/^\/api\/?/, '')
        .split('/')
        .filter(Boolean)
        .map((part) => decodeURIComponent(part))
}

const resolveRoute = (parts) => {
    const [resource, id, action] = parts

    if (parts.length === 1 && resource === 'audit-log') return route(auditLog)
    if (parts.length === 1 && resource === 'bookings') return route(bookings)
    if (parts.length === 3 && resource === 'bookings' && action === 'cancel') return route(cancelBooking, { bookingId: id })
    if (parts.length === 3 && resource === 'bookings' && action === 'review') return route(reviewBooking, { bookingId: id })
    if (parts.length === 2 && resource === 'internal' && id === 'sync') return route(internalSync)
    if (parts.length === 1 && resource === 'lab-config') return route(labConfig)
    if (parts.length === 1 && resource === 'machines') return route(machines)
    if (parts.length === 2 && resource === 'machines') return route(machineDetails, { machineId: id })
    if (parts.length === 3 && resource === 'machines' && action === 'availability') {
        return route(machineAvailability, { machineId: id })
    }
    if (parts.length === 1 && resource === 'maintenance-windows') return route(maintenanceWindows)
    if (parts.length === 2 && resource === 'maintenance-windows') return route(maintenanceWindowDetails, { windowId: id })
    if (parts.length === 1 && resource === 'notifications') return route(notifications)
    if (parts.length === 2 && resource === 'profile' && id === 'faculty-requests') return route(facultyRequests)
    if (parts.length === 2 && resource === 'profile' && id === 'me') return route(profileMe)
    if (parts.length === 3 && resource === 'profile' && action === 'approve') return route(approveProfile, { userId: id })
    if (parts.length === 3 && resource === 'profile' && action === 'reject') return route(rejectProfile, { userId: id })
    if (parts.length === 1 && resource === 'training-records') return route(trainingRecords)
    if (parts.length === 1 && resource === 'users') return route(users)
    if (parts.length === 3 && resource === 'users' && action === 'role') return route(updateUserRole, { userId: id })
    if (parts.length === 3 && resource === 'users' && action === 'status') return route(updateUserStatus, { userId: id })

    return null
}

export default async function handler(req, res) {
    const match = resolveRoute(getPathParts(req))
    if (!match) {
        return sendError(res, new ApiError(404, 'API route not found.', 'not_found'))
    }
    return match.handler(withParams(req, match.params), res)
}
