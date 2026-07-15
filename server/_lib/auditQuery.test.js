import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from './http.js'
import {
    buildAuditListQuery,
    decodeAuditCursor,
    encodeAuditCursor,
    parseAuditListParams,
    redactAuditLogForRole,
    toAuditPage,
} from './auditQuery.js'

const makeQuery = () => {
    const calls = []
    const query = {}
    for (const method of ['where', 'orderBy', 'startAfter', 'limit']) {
        query[method] = vi.fn((...args) => {
            calls.push([method, ...args])
            return query
        })
    }
    return { calls, query }
}

const makeDoc = (id, data) => ({ id, data: () => data })

describe('audit query policy', () => {
    it('applies both filters before ordering and limiting in Firestore', () => {
        const { calls, query } = makeQuery()
        const documentIdField = { kind: 'document-id' }

        const result = buildAuditListQuery(query, {
            entityType: 'booking',
            action: 'booking.approved',
            pageSize: 25,
            cursor: {
                createdAt: '2026-07-15T00:00:00.000Z',
                id: 'event-25',
            },
        }, documentIdField)

        expect(result).toBe(query)
        expect(calls).toEqual([
            ['where', 'entity_type', '==', 'booking'],
            ['where', 'action', '==', 'booking.approved'],
            ['orderBy', 'created_at', 'desc'],
            ['orderBy', documentIdField, 'desc'],
            ['startAfter', '2026-07-15T00:00:00.000Z', 'event-25'],
            ['limit', 26],
        ])
    })

    it('binds stable cursors to the active filters', () => {
        const cursor = encodeAuditCursor({
            id: 'event-2',
            created_at: '2026-07-15T00:00:00.000Z',
        }, { entityType: 'booking', action: 'booking.approved' })

        expect(decodeAuditCursor(cursor, {
            entityType: 'booking',
            action: 'booking.approved',
        })).toEqual({
            createdAt: '2026-07-15T00:00:00.000Z',
            id: 'event-2',
        })
        expect(() => decodeAuditCursor(cursor, {
            entityType: 'machine',
            action: 'booking.approved',
        })).toThrow(ApiError)
    })

    it('returns an array page and a cursor based on the last returned tie-breaker', () => {
        const params = {
            entityType: 'booking',
            action: '',
            pageSize: 2,
            cursor: null,
        }
        const snapshot = {
            docs: [
                makeDoc('event-z', {
                    created_at: '2026-07-15T00:00:00.000Z',
                    entity_type: 'booking',
                    metadata: { machine_id: 'machine-1' },
                }),
                makeDoc('event-y', {
                    created_at: '2026-07-15T00:00:00.000Z',
                    entity_type: 'booking',
                    metadata: { machine_id: 'machine-2' },
                }),
                makeDoc('event-x', {
                    created_at: '2026-07-15T00:00:00.000Z',
                    entity_type: 'booking',
                    metadata: { machine_id: 'machine-3' },
                }),
            ],
        }

        const page = toAuditPage(snapshot, params, 'admin')

        expect(Array.isArray(page.logs)).toBe(true)
        expect(page.logs.map((log) => log.id)).toEqual(['event-z', 'event-y'])
        expect(decodeAuditCursor(page.nextCursor, params)).toEqual({
            createdAt: '2026-07-15T00:00:00.000Z',
            id: 'event-y',
        })
    })

    it('redacts free-form, contact, and unknown metadata from faculty', () => {
        const log = {
            id: 'event-1',
            metadata: {
                machine_id: 'machine-1',
                status: 'rejected',
                reason: 'Contains private circumstances',
                email: 'private@example.edu',
                future_sensitive_field: 'must default closed',
            },
        }

        expect(redactAuditLogForRole(log, 'faculty').metadata).toEqual({
            machine_id: 'machine-1',
            status: 'rejected',
            reason: '[redacted]',
            email: '[redacted]',
            future_sensitive_field: '[redacted]',
        })
        expect(redactAuditLogForRole(log, 'admin')).toBe(log)
    })

    it('rejects ambiguous filters and out-of-range page sizes', () => {
        expect(() => parseAuditListParams({ entity_type: ['booking'] })).toThrow(ApiError)
        expect(() => parseAuditListParams({ action: 'booking approved' })).toThrow(ApiError)
        expect(() => parseAuditListParams({ limit: '101' })).toThrow(ApiError)
        expect(parseAuditListParams({ limit: '25' }).pageSize).toBe(25)
    })

    it('keeps composite indexes for every supported filtered ordering', () => {
        const indexFile = JSON.parse(readFileSync(
            new URL('../../firebase/firestore.indexes.json', import.meta.url),
            'utf8',
        ))
        const auditIndexes = indexFile.indexes
            .filter((index) => index.collectionGroup === 'audit_log')
            .map((index) => index.fields.map((field) => `${field.fieldPath}:${field.order}`))

        expect(auditIndexes).toContainEqual([
            'entity_type:ASCENDING',
            'created_at:DESCENDING',
        ])
        expect(auditIndexes).toContainEqual([
            'action:ASCENDING',
            'created_at:DESCENDING',
        ])
        expect(auditIndexes).toContainEqual([
            'entity_type:ASCENDING',
            'action:ASCENDING',
            'created_at:DESCENDING',
        ])
    })
})
