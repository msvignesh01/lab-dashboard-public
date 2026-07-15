import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../_lib/http.js'

const mocks = vi.hoisted(() => {
    const query = {}
    for (const method of ['where', 'orderBy', 'startAfter', 'limit']) {
        query[method] = vi.fn(() => query)
    }
    query.get = vi.fn()
    return {
        query,
        collection: vi.fn(() => query),
        getAuthenticatedContext: vi.fn(),
        getUsers: vi.fn(),
    }
})

vi.mock('../../_lib/firebaseAdmin.js', () => ({
    adminAuth: { getUsers: mocks.getUsers },
    adminDb: { collection: mocks.collection },
}))
vi.mock('../../_lib/authContext.js', () => ({
    getAuthenticatedContext: mocks.getAuthenticatedContext,
}))

import usersHandler, {
    buildUserListQuery,
    decodeUserCursor,
    encodeUserCursor,
    parseUserListParams,
} from './index.js'

const makeDoc = (id, data = {}) => ({ id, data: () => data })

const createResponse = () => {
    const response = {
        headers: {},
        statusCode: null,
        payload: null,
        setHeader: vi.fn((name, value) => {
            response.headers[name.toLowerCase()] = value
        }),
        status: vi.fn((statusCode) => {
            response.statusCode = statusCode
            return response
        }),
        json: vi.fn((payload) => {
            response.payload = payload
            return response
        }),
    }
    return response
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const method of ['where', 'orderBy', 'startAfter', 'limit']) {
        mocks.query[method].mockReturnValue(mocks.query)
    }
    mocks.collection.mockReturnValue(mocks.query)
    mocks.getAuthenticatedContext.mockResolvedValue({ profile: { role: 'admin' } })
    mocks.getUsers.mockResolvedValue({ users: [] })
})

describe('user directory pagination', () => {
    it('orders by the document ID and applies filters before a stable cursor and limit', () => {
        const collection = {}
        const calls = []
        for (const method of ['where', 'orderBy', 'startAfter', 'limit']) {
            collection[method] = vi.fn((...args) => {
                calls.push([method, ...args])
                return collection
            })
        }
        const documentId = { kind: 'document-id' }

        expect(buildUserListQuery(collection, {
            status: 'active',
            role: 'faculty',
            pageSize: 25,
            cursor: 'user-025',
        }, documentId)).toBe(collection)
        expect(calls).toEqual([
            ['where', 'status', '==', 'active'],
            ['where', 'role', '==', 'faculty'],
            ['orderBy', documentId, 'asc'],
            ['startAfter', 'user-025'],
            ['limit', 26],
        ])
    })

    it('binds opaque cursors to the active filters and validates list parameters', () => {
        const cursor = encodeUserCursor('user-050', { status: 'active', role: 'student' })

        expect(decodeUserCursor(cursor, { status: 'active', role: 'student' })).toBe('user-050')
        expect(() => decodeUserCursor(cursor, { status: 'suspended', role: 'student' })).toThrow(ApiError)
        expect(() => parseUserListParams({ role: 'owner' })).toThrow(ApiError)
        expect(() => parseUserListParams({ status: ['active'] })).toThrow(ApiError)
        expect(() => parseUserListParams({ limit: '101' })).toThrow(ApiError)
        expect(parseUserListParams({ limit: '25' }).pageSize).toBe(25)
    })

    it('returns only the requested page, enriches that page in one batch, and exposes its next cursor', async () => {
        mocks.query.get.mockResolvedValue({
            docs: [
                makeDoc('user-a', {
                    email: 'a@example.edu',
                    auth_sync_status: 'pending',
                    auth_sync_target: 'active',
                    auth_sync_updated_at: '2000-01-01T00:00:00.000Z',
                }),
                makeDoc('user-b', { email: 'b@example.edu' }),
                makeDoc('user-c', { email: 'c@example.edu' }),
            ],
        })
        mocks.getUsers.mockResolvedValue({
            users: [
                { uid: 'user-a', disabled: false, emailVerified: true },
                { uid: 'user-b', disabled: true, emailVerified: false },
            ],
        })
        const response = createResponse()

        await usersHandler({ method: 'GET', query: { limit: '2' }, headers: {} }, response)

        expect(response.statusCode).toBe(200)
        expect(response.payload.error).toBeNull()
        expect(response.payload.data).toEqual([
            expect.objectContaining({
                id: 'user-a',
                auth_disabled: false,
                auth_email_verified: true,
                auth_sync_recoverable: true,
            }),
            expect.objectContaining({
                id: 'user-b',
                auth_disabled: true,
                auth_email_verified: false,
                auth_sync_recoverable: false,
            }),
        ])
        expect(mocks.getUsers).toHaveBeenCalledWith([
            { uid: 'user-a' },
            { uid: 'user-b' },
        ])
        expect(decodeUserCursor(response.headers['x-users-next-cursor'])).toBe('user-b')
        expect(response.headers['cache-control']).toContain('no-store')
        expect(mocks.query.orderBy).toHaveBeenCalledWith(expect.anything(), 'asc')
        expect(mocks.query.limit).toHaveBeenCalledWith(3)
    })

    it('returns an empty cursor when the complete page has been delivered', async () => {
        mocks.query.get.mockResolvedValue({ docs: [makeDoc('user-a')] })
        const response = createResponse()

        await usersHandler({ method: 'GET', query: { limit: '2' }, headers: {} }, response)

        expect(response.statusCode).toBe(200)
        expect(response.headers['x-users-next-cursor']).toBe('')
    })

    it('returns a structured 400 response for an invalid cursor', async () => {
        const response = createResponse()

        await usersHandler({ method: 'GET', query: { cursor: 'not-a-valid-payload' }, headers: {} }, response)

        expect(response.statusCode).toBe(400)
        expect(response.payload.error).toMatchObject({ code: 'invalid_user_cursor' })
        expect(mocks.query.get).not.toHaveBeenCalled()
    })
})
