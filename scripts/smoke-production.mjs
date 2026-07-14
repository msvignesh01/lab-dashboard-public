import { spawn } from 'node:child_process'

const port = Number(process.env.SMOKE_PORT || 3199)
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('SMOKE_PORT must be an unprivileged TCP port.')
}

const origin = `http://127.0.0.1:${port}`
const server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
        cwd: process.cwd(),
        env: { ...process.env, NODE_ENV: 'production' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    },
)

let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const waitForServer = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (server.exitCode !== null) {
            throw new Error(`Production server exited before becoming ready.\n${serverOutput}`)
        }
        try {
            const response = await fetch(`${origin}/`, { redirect: 'manual' })
            if (response.status === 200) return
        } catch {
            // The socket is expected to refuse connections while Next starts.
        }
        await delay(250)
    }
    throw new Error(`Production server did not become ready.\n${serverOutput}`)
}

const expectStatus = async (path, status) => {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' })
    if (response.status !== status) {
        throw new Error(`${path} returned ${response.status}; expected ${status}.`)
    }
    return response
}

try {
    await waitForServer()

    for (const path of ['/', '/login', '/signup', '/portal']) {
        const response = await expectStatus(path, 200)
        const cacheControl = response.headers.get('cache-control') || ''
        const csp = response.headers.get('content-security-policy') || ''
        if (!cacheControl.includes('no-store')) throw new Error(`${path} is missing no-store cache policy.`)
        if (!csp.includes("frame-ancestors 'none'")) throw new Error(`${path} is missing the frame-ancestor policy.`)
        if (!csp.includes('https://www.google.com/recaptcha/')) throw new Error(`${path} blocks the configured reCAPTCHA service.`)
        if (!csp.includes('https://recaptcha.google.com/recaptcha/')) throw new Error(`${path} blocks reCAPTCHA challenge frames.`)
    }

    const unauthenticated = await expectStatus('/api/profile/me', 401)
    const unauthenticatedBody = await unauthenticated.json()
    if (unauthenticatedBody?.error?.code !== 'auth_required') {
        throw new Error('Known private API route did not return the authentication boundary error.')
    }
    if (!(unauthenticated.headers.get('cache-control') || '').includes('no-store')) {
        throw new Error('API error response is missing no-store cache policy.')
    }

    for (const path of ['/api/internal/sync', '/api/not-a-route']) {
        const response = await expectStatus(path, 404)
        const body = await response.json()
        if (body?.error?.code !== 'not_found') throw new Error(`${path} did not return the not-found contract.`)
    }

    process.stdout.write('Production smoke test passed.\n')
} finally {
    if (server.exitCode === null) server.kill('SIGTERM')
}
