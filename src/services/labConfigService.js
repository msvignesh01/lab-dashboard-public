import { apiRequest } from '@/services/apiClient'

export const labConfigService = {
    getConfig: () => apiRequest('/api/lab-config', { forceRefreshToken: true }),
    updateConfig: (payload) => apiRequest('/api/lab-config', {
        method: 'PATCH',
        body: payload,
        forceRefreshToken: true,
    }),
}
