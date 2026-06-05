export class ApiError extends Error {
    constructor(status, message, code = 'request_failed') {
        super(message)
        this.name = 'ApiError'
        this.status = status
        this.code = code
    }
}

export const assertMethod = (req, allowedMethods) => {
    const allowed = Array.isArray(allowedMethods) ? allowedMethods : [allowedMethods]
    if (!allowed.includes(req.method)) {
        throw new ApiError(405, 'Method not allowed', 'method_not_allowed')
    }
}

export const getBearerToken = (req) => {
    const header = req.headers.authorization || req.headers.Authorization || ''
    const value = Array.isArray(header) ? header[0] : header
    if (!value.startsWith('Bearer ')) {
        throw new ApiError(401, 'Authentication required', 'auth_required')
    }
    return value.slice('Bearer '.length).trim()
}

export const parseJsonBody = async (req) => {
    if (!req.body) return {}

    const maxBytes = 16 * 1024

    if (typeof req.body === 'object') {
        if (Buffer.byteLength(JSON.stringify(req.body), 'utf8') > maxBytes) {
            throw new ApiError(413, 'Request payload is too large.', 'payload_too_large')
        }
        return req.body
    }

    if (typeof req.body === 'string') {
        if (Buffer.byteLength(req.body, 'utf8') > maxBytes) {
            throw new ApiError(413, 'Request payload is too large.', 'payload_too_large')
        }
        try {
            return JSON.parse(req.body)
        } catch {
            throw new ApiError(400, 'Invalid JSON payload', 'invalid_json')
        }
    }

    throw new ApiError(400, 'Invalid request payload', 'invalid_payload')
}

export const getRouteParam = (req, name) => {
    const value = req.query?.[name]
    if (Array.isArray(value)) return value[0]
    return value
}

export const sendOk = (res, data = null, status = 200) => {
    return res.status(status).json({ data, error: null })
}

export const sendError = (res, err) => {
    const status = Number.isInteger(err?.status) ? err.status : 500
    const code = err?.code || (status === 500 ? 'internal_error' : 'request_failed')
    const message = status >= 500
        ? 'The service is temporarily unavailable. Please try again later.'
        : err?.message || 'Request failed'

    return res.status(status).json({
        data: null,
        error: { message, code },
    })
}

export const handleApi = (handler) => async (req, res) => {
    try {
        return await handler(req, res)
    } catch (err) {
        if (!(err instanceof ApiError)) {
            console.error('[api]', err?.message || err)
        }
        return sendError(res, err)
    }
}
