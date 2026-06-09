// Lightweight, dependency-free client error reporting.
//
// In production the build strips console output (vite `drop_console`) and
// `securityUtils.secureLog` only logs in development, so uncaught client errors
// would otherwise disappear with no trace. This module forwards a minimal,
// PII-light report to an optional endpoint configured via `VITE_ERROR_REPORT_URL`
// (e.g. a serverless logging function, Sentry tunnel, or webhook).
//
// It is a no-op when the endpoint is not configured and is guaranteed never to throw.

const ENDPOINT = import.meta.env.VITE_ERROR_REPORT_URL

const truncate = (value, max) => {
    if (typeof value !== 'string') return ''
    return value.length > max ? value.slice(0, max) : value
}

export const reportClientError = (error, context = {}) => {
    try {
        if (!ENDPOINT) return

        const payload = {
            message: truncate(error?.message || String(error ?? 'Unknown error'), 500),
            stack: truncate(error?.stack || '', 2000),
            context: {
                ...context,
                path: typeof window !== 'undefined' ? window.location?.pathname : undefined,
                userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
                timestamp: new Date().toISOString(),
            },
        }

        const body = JSON.stringify(payload)

        // Prefer sendBeacon so reports survive navigation/unload.
        if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
            navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))
            return
        }

        if (typeof fetch === 'function') {
            fetch(ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
                keepalive: true,
            }).catch(() => {})
        }
    } catch {
        // Error reporting must never break the app.
    }
}

let installed = false

export const installGlobalErrorReporting = () => {
    if (installed || typeof window === 'undefined') return
    installed = true

    window.addEventListener('error', (event) => {
        reportClientError(event?.error || event?.message, { type: 'window_error' })
    })

    window.addEventListener('unhandledrejection', (event) => {
        reportClientError(event?.reason, { type: 'unhandled_rejection' })
    })
}
