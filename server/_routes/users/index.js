import { FieldPath } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { ApiError, assertMethod, handleApi, sendOk } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { isPendingAuthSyncRecoverable } from '../../_lib/userPolicy.js'

export const USER_DEFAULT_PAGE_SIZE = 50
export const USER_MAX_PAGE_SIZE = 100

const VALID_STATUSES = new Set(['active', 'pending_approval', 'suspended'])
const VALID_ROLES = new Set(['student', 'faculty', 'admin'])
const CURSOR_PATTERN = /^[a-zA-Z0-9_-]+$/

const readEnumFilter = (value, name, allowed) => {
    if (value === undefined || value === null || value === '') return ''
    if (typeof value !== 'string' || !allowed.has(value)) {
        throw new ApiError(400, `Invalid user ${name} filter.`, 'invalid_user_filter')
    }
    return value
}

const readPageSize = (value) => {
    if (value === undefined || value === null || value === '') return USER_DEFAULT_PAGE_SIZE
    if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) {
        throw new ApiError(400, 'Invalid user page size.', 'invalid_user_limit')
    }

    const pageSize = Number(value)
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > USER_MAX_PAGE_SIZE) {
        throw new ApiError(400, 'User page size must be between 1 and 100.', 'invalid_user_limit')
    }
    return pageSize
}

export const encodeUserCursor = (id, { status = '', role = '' } = {}) => {
    if (!isValidFirestoreId(id)) {
        throw new Error('Cannot create a cursor for an invalid user record.')
    }
    return Buffer.from(JSON.stringify({ v: 1, id, status, role }), 'utf8').toString('base64url')
}

export const decodeUserCursor = (rawCursor, { status = '', role = '' } = {}) => {
    if (typeof rawCursor !== 'string' || rawCursor.length > 2048 || !CURSOR_PATTERN.test(rawCursor)) {
        throw new ApiError(400, 'Invalid user cursor.', 'invalid_user_cursor')
    }

    let payload
    try {
        payload = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8'))
    } catch {
        throw new ApiError(400, 'Invalid user cursor.', 'invalid_user_cursor')
    }

    if (
        payload?.v !== 1
        || !isValidFirestoreId(payload.id)
        || payload.status !== status
        || payload.role !== role
    ) {
        throw new ApiError(400, 'Invalid user cursor.', 'invalid_user_cursor')
    }
    return payload.id
}

export const parseUserListParams = (query = {}) => {
    const status = readEnumFilter(query.status, 'status', VALID_STATUSES)
    const role = readEnumFilter(query.role, 'role', VALID_ROLES)
    const pageSize = readPageSize(query.limit)
    const cursor = query.cursor ? decodeUserCursor(query.cursor, { status, role }) : null
    return { status, role, pageSize, cursor }
}

export const buildUserListQuery = (collection, params, documentIdField) => {
    let query = collection
    if (params.status) query = query.where('status', '==', params.status)
    if (params.role) query = query.where('role', '==', params.role)

    query = query.orderBy(documentIdField, 'asc')
    if (params.cursor) query = query.startAfter(params.cursor)
    return query.limit(params.pageSize + 1)
}

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })

    const params = parseUserListParams(req.query)
    const query = buildUserListQuery(
        adminDb.collection('profiles'),
        params,
        FieldPath.documentId(),
    )
    const snapshot = await query.get()
    const pageDocs = snapshot.docs.slice(0, params.pageSize)
    const profileDocs = pageDocs.map((doc) => ({ ...doc.data(), id: doc.id }))

    // Batch Firebase Auth lookups (max 100 identifiers per getUsers call) instead of
    // one getUser request per profile. Auth metadata is enrichment: a failed chunk is
    // represented as unknown without discarding the authoritative profile page.
    const authByUid = new Map()
    for (let i = 0; i < profileDocs.length; i += 100) {
        const chunk = profileDocs.slice(i, i + 100)
        try {
            const result = await adminAuth.getUsers(chunk.map((profile) => ({ uid: profile.id })))
            for (const user of result.users) authByUid.set(user.uid, user)
        } catch {
            // Leave this chunk's auth metadata unresolved; reported as null below.
        }
    }

    const profiles = profileDocs.map((profile) => {
        const user = authByUid.get(profile.id)
        return {
            ...profile,
            auth_disabled: user ? user.disabled === true : null,
            auth_email_verified: user ? user.emailVerified === true : null,
            auth_sync_recoverable: isPendingAuthSyncRecoverable(profile),
        }
    })

    const lastDoc = pageDocs[pageDocs.length - 1]
    const nextCursor = snapshot.docs.length > params.pageSize && lastDoc
        ? encodeUserCursor(lastDoc.id, params)
        : null

    res.setHeader('X-Users-Next-Cursor', nextCursor || '')
    return sendOk(res, profiles)
})
