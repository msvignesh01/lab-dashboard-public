import { apiRequest } from '@/services/apiClient'

const toQuery = (params = {}) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value)
    }
    return search.toString()
}

export const userService = {
    getUsers: (params = {}) => {
        const query = toQuery(params)
        return apiRequest(`/api/users${query ? `?${query}` : ''}`, { forceRefreshToken: true })
    },
    updateStatus: (userId, status) => apiRequest(`/api/users/${userId}/status`, {
        method: 'PATCH',
        body: { status },
        forceRefreshToken: true,
    }),
    updateRole: (userId, role) => apiRequest(`/api/users/${userId}/role`, {
        method: 'PATCH',
        body: { role },
        forceRefreshToken: true,
    }),
}
