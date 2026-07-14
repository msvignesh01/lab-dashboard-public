import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    buildAuditListQuery: vi.fn(),
    collection: vi.fn(),
    get: vi.fn(),
    getAuthenticatedContext: vi.fn(),
    parseAuditListParams: vi.fn(),
    toAuditPage: vi.fn(),
}))

vi.mock('../../_lib/firebaseAdmin.js', () => ({
    adminDb: { collection: mocks.collection },
}))
vi.mock('../../_lib/authContext.js', () => ({
    getAuthenticatedContext: mocks.getAuthenticatedContext,
}))
vi.mock('../../_lib/auditQuery.js', () => ({
    buildAuditListQuery: mocks.buildAuditListQuery,
    parseAuditListParams: mocks.parseAuditListParams,
    toAuditPage: mocks.toAuditPage,
}))

import auditLogHandler from './index.js'

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
    mocks.collection.mockReturnValue({ name: 'audit_log' })
    mocks.buildAuditListQuery.mockReturnValue({ get: mocks.get })
    mocks.get.mockResolvedValue({ docs: [] })
    mocks.getAuthenticatedContext.mockResolvedValue({ profile: { role: 'faculty' } })
    mocks.parseAuditListParams.mockReturnValue({ pageSize: 50 })
    mocks.toAuditPage.mockReturnValue({
        logs: [{ id: 'audit-1' }],
        nextCursor: 'next-audit-page',
    })
})

describe('GET /api/audit-log pagination response', () => {
    it('exposes the next cursor while preserving private no-store behavior', async () => {
        const response = createResponse()

        await auditLogHandler({ method: 'GET', query: {}, headers: {} }, response)

        expect(response.statusCode).toBe(200)
        expect(response.payload).toEqual({ data: [{ id: 'audit-1' }], error: null })
        expect(response.headers['x-audit-next-cursor']).toBe('next-audit-page')
        expect(response.headers['cache-control']).toContain('private')
        expect(response.headers['cache-control']).toContain('no-store')
        expect(mocks.toAuditPage).toHaveBeenCalledWith(
            { docs: [] },
            { pageSize: 50 },
            'faculty',
        )
    })
})
