import { firebaseAuth } from '@/lib/firebase'

const normalizeApiError = (fallback, err) => {
    return {
        message: typeof err?.message === 'string' && err.message.trim() ? err.message : fallback,
        code: err?.code || 'request_failed',
    }
}

export const apiRequest = async (path, { method = 'GET', body, forceRefreshToken = false } = {}) => {
    try {
        const currentUser = firebaseAuth.currentUser
        if (!currentUser) {
            return { data: null, error: { message: 'Authentication required.', code: 'auth_required' } }
        }

        const token = await currentUser.getIdToken(forceRefreshToken)
        const response = await fetch(path, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })

        const payload = await response.json().catch(() => null)
        if (!response.ok || payload?.error) {
            return {
                data: null,
                error: normalizeApiError('Request failed.', payload?.error || { code: response.status }),
            }
        }

        return { data: payload?.data ?? null, error: null }
    } catch {
        return {
            data: null,
            error: { message: 'Network error. Please check your connection and try again.', code: 'network_error' },
        }
    }
}
