import { apiRequest } from '@/services/apiClient'

const toQuery = (params = {}) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value)
    }
    return search.toString()
}

export const trainingService = {
    getRecords: (params = {}) => {
        const query = toQuery(params)
        return apiRequest(`/api/training-records${query ? `?${query}` : ''}`, { forceRefreshToken: true })
    },
    saveRecord: (payload) => apiRequest('/api/training-records', {
        method: 'POST',
        body: payload,
        forceRefreshToken: true,
    }),
}
