// Local dev server for the Vercel-style /api functions, so the full stack can run
// end-to-end on a developer machine. Vite proxies /api here (see vite.config.js).
// DEV/TEST ONLY — not part of the production deploy.
//
// Run with admin credentials loaded from .env.local:
//   npm run dev:api      (==> node --env-file=.env.local scripts/dev-api.mjs)
import http from 'node:http'

const PORT = Number(process.env.DEV_API_PORT || 3001)

const readBody = (req) => new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => resolve(raw))
    req.on('error', () => resolve(''))
})

const makeRes = (nodeRes) => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this },
    setHeader(key, value) { nodeRes.setHeader(key, value); return this },
    json(obj) {
        nodeRes.writeHead(this.statusCode, { 'Content-Type': 'application/json' })
        nodeRes.end(JSON.stringify(obj))
        return this
    },
})

const start = async () => {
    let handler
    try {
        // Imported lazily so a clear message prints if FIREBASE_ADMIN_* are missing.
        const mod = await import('../api/index.js')
        handler = mod.default
    } catch (err) {
        console.error('[dev-api] Could not load the API handler.')
        console.error('[dev-api] Ensure FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY are set in .env.local')
        console.error(err?.message || err)
        process.exit(1)
    }

    const server = http.createServer(async (nodeReq, nodeRes) => {
        try {
            const url = new URL(nodeReq.url, 'http://localhost')
            if (!url.pathname.startsWith('/api')) {
                nodeRes.writeHead(404, { 'Content-Type': 'application/json' })
                nodeRes.end(JSON.stringify({ data: null, error: { message: 'Not found', code: 'not_found' } }))
                return
            }
            const raw = await readBody(nodeReq)
            const req = {
                method: nodeReq.method,
                url: nodeReq.url,
                headers: nodeReq.headers,
                query: Object.fromEntries(url.searchParams.entries()),
                body: raw || undefined,
            }
            await handler(req, makeRes(nodeRes))
        } catch (err) {
            console.error('[dev-api] unhandled error:', err?.message || err)
            if (!nodeRes.headersSent) {
                nodeRes.writeHead(500, { 'Content-Type': 'application/json' })
                nodeRes.end(JSON.stringify({ data: null, error: { message: 'dev-api error', code: 'internal_error' } }))
            }
        }
    })

    server.listen(PORT, '127.0.0.1', () => {
        process.stdout.write(`[dev-api] listening on http://127.0.0.1:${PORT} (Vite proxies /api here)\n`)
    })
}

start()
