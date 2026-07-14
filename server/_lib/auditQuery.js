import { ApiError } from './http.js'
import { isValidFirestoreId } from './ids.js'

export const AUDIT_DEFAULT_PAGE_SIZE = 100
export const AUDIT_MAX_PAGE_SIZE = 100

const FILTER_PATTERN = /^[a-zA-Z0-9_.:-]+$/
const CURSOR_PATTERN = /^[a-zA-Z0-9_-]+$/
const REDACTED = '[redacted]'

// Faculty need operational context, but not free-text or identity/contact data.
// Unknown fields are redacted by default so newly-added metadata cannot leak.
const FACULTY_METADATA_ALLOWLIST = new Set([
    'active_weekdays',
    'booking_date',
    'close_time',
    'created',
    'department',
    'end_at',
    'end_time',
    'fields',
    'historical_bookings',
    'id',
    'is_active',
    'machine_id',
    'max_advance_days',
    'max_duration_hours',
    'name',
    'open_time',
    'requires_training',
    'role',
    'scope',
    'start_at',
    'start_time',
    'status',
    'student_id',
    'timezone',
    'timezone_offset_minutes',
])

const readFilter = (value, name, maxLength) => {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value !== 'string') {
        throw new ApiError(400, `Invalid ${name} filter.`, 'invalid_audit_filter')
    }

    const normalized = value.trim()
    if (!normalized || normalized.length > maxLength || !FILTER_PATTERN.test(normalized)) {
        throw new ApiError(400, `Invalid ${name} filter.`, 'invalid_audit_filter')
    }
    return normalized
}

const readPageSize = (value) => {
    if (value === undefined || value === null || value === '') return AUDIT_DEFAULT_PAGE_SIZE
    if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
        throw new ApiError(400, 'Invalid audit page size.', 'invalid_audit_limit')
    }

    const pageSize = Number(value)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > AUDIT_MAX_PAGE_SIZE) {
        throw new ApiError(400, 'Audit page size must be between 1 and 100.', 'invalid_audit_limit')
    }
    return pageSize
}

export const encodeAuditCursor = (log, { entityType = '', action = '' } = {}) => {
    if (
        typeof log?.created_at !== 'string'
        || !log.created_at
        || log.created_at.length > 100
        || !isValidFirestoreId(log.id)
    ) {
        throw new Error('Cannot create a cursor for an invalid audit record.')
    }

    return Buffer.from(JSON.stringify({
        v: 1,
        created_at: log.created_at,
        id: log.id,
        entity_type: entityType,
        action,
    }), 'utf8').toString('base64url')
}

export const decodeAuditCursor = (rawCursor, { entityType = '', action = '' } = {}) => {
    if (typeof rawCursor !== 'string' || rawCursor.length > 2048 || !CURSOR_PATTERN.test(rawCursor)) {
        throw new ApiError(400, 'Invalid audit cursor.', 'invalid_audit_cursor')
    }

    let payload
    try {
        payload = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'))
    } catch {
        throw new ApiError(400, 'Invalid audit cursor.', 'invalid_audit_cursor')
    }

    if (
        payload?.v !== 1
        || typeof payload.created_at !== 'string'
        || !payload.created_at
        || payload.created_at.length > 100
        || !isValidFirestoreId(payload.id)
        || payload.entity_type !== entityType
        || payload.action !== action
    ) {
        throw new ApiError(400, 'Invalid audit cursor.', 'invalid_audit_cursor')
    }

    return {
        createdAt: payload.created_at,
        id: payload.id,
    }
}

export const parseAuditListParams = (query = {}) => {
    const entityType = readFilter(query.entity_type, 'entity type', 80)
    const action = readFilter(query.action, 'action', 100)
    const pageSize = readPageSize(query.limit)
    const cursor = query.cursor
        ? decodeAuditCursor(query.cursor, { entityType, action })
        : null

    return { entityType, action, pageSize, cursor }
}

export const buildAuditListQuery = (collection, params, documentIdField) => {
    let query = collection
    if (params.entityType) query = query.where('entity_type', '==', params.entityType)
    if (params.action) query = query.where('action', '==', params.action)

    query = query
        .orderBy('created_at', 'desc')
        .orderBy(documentIdField, 'desc')

    if (params.cursor) {
        query = query.startAfter(params.cursor.createdAt, params.cursor.id)
    }

    // Fetch one extra record to determine whether another page exists.
    return query.limit(params.pageSize + 1)
}

const redactFacultyMetadata = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (!FACULTY_METADATA_ALLOWLIST.has(key)) return [key, REDACTED]
        if (Array.isArray(item)) {
            return [key, item.map((entry) => (
                entry && typeof entry === 'object' ? REDACTED : entry
            ))]
        }
        if (item && typeof item === 'object') return [key, REDACTED]
        return [key, item]
    }))
}

export const redactAuditLogForRole = (log, role) => {
    if (role === 'admin') return log
    return {
        ...log,
        metadata: redactFacultyMetadata(log.metadata),
    }
}

export const toAuditPage = (snapshot, params, role) => {
    const pageDocs = snapshot.docs.slice(0, params.pageSize)
    const rawLogs = pageDocs.map((doc) => ({ ...doc.data(), id: doc.id }))
    const logs = rawLogs.map((log) => redactAuditLogForRole(log, role))
    const lastLog = rawLogs[rawLogs.length - 1]
    const nextCursor = snapshot.docs.length > params.pageSize && lastLog
        ? encodeAuditCursor(lastLog, params)
        : null

    return { logs, nextCursor }
}
