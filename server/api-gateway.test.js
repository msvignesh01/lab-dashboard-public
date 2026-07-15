import { existsSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import handler, { createApiHandler } from './api-gateway.js'

const response = () => {
    const headers = new Map()
    return {
        headers,
        statusCode: 200,
        payload: null,
        setHeader: vi.fn((name, value) => headers.set(name.toLowerCase(), value)),
        status: vi.fn(function status(code) {
            this.statusCode = code
            return this
        }),
        json: vi.fn(function json(payload) {
            this.payload = payload
            return this
        }),
    }
}

describe('API facade dispatch boundary', () => {
    it('does not expose a duplicate top-level Vercel API function surface', () => {
        expect(existsSync(new URL('../api', import.meta.url))).toBe(false)
    })

    it.each([
        '/api/not-a-route',
        '/api/internal/sync',
        '/api/%E0%A4%A',
    ])('returns a private 404 for an unavailable route: %s', async (url) => {
        const res = response()
        await handler({ method: 'GET', url, headers: {}, query: {} }, res)

        expect(res.statusCode).toBe(404)
        expect(res.payload.error.code).toBe('not_found')
        expect(res.headers.get('cache-control')).toContain('no-store')
    })

    it('rejects a known route without a bearer token before loading Firebase Admin', async () => {
        const res = response()
        await handler({ method: 'GET', url: '/api/profile/me', headers: {}, query: {} }, res)

        expect(res.statusCode).toBe(401)
        expect(res.payload.error.code).toBe('auth_required')
        expect(res.headers.get('cache-control')).toContain('no-store')
    })

    it('logs unexpected loader failures while returning only a generic private error', async () => {
        const unexpected = new Error('sensitive module initialization detail')
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const failingHandler = createApiHandler({
            resolveRouteImpl: () => ({
                loader: vi.fn().mockRejectedValue(unexpected),
                params: {},
            }),
        })
        const res = response()

        await failingHandler({
            method: 'GET',
            url: '/api/profile/me',
            headers: { authorization: 'Bearer test-token' },
            query: {},
        }, res)

        expect(consoleError).toHaveBeenCalledWith(
            '[api:dispatch]',
            'sensitive module initialization detail',
        )
        expect(res.statusCode).toBe(500)
        expect(res.payload.error).toEqual({
            code: 'internal_error',
            message: 'The service is temporarily unavailable. Please try again later.',
        })
        expect(JSON.stringify(res.payload)).not.toContain('sensitive module initialization detail')
        expect(res.headers.get('cache-control')).toContain('no-store')

        consoleError.mockRestore()
    })
})
