import { apiRequest } from '@/services/apiClient'

export const maintenanceService = {
    getWindows: () => apiRequest('/api/maintenance-windows', { forceRefreshToken: true }),
    createWindow: (payload) => apiRequest('/api/maintenance-windows', {
        method: 'POST',
        body: payload,
        forceRefreshToken: true,
    }),
    updateWindow: (id, payload) => apiRequest(`/api/maintenance-windows/${id}`, {
        method: 'PATCH',
        body: payload,
        forceRefreshToken: true,
    }),
    cancelWindow: (id) => apiRequest(`/api/maintenance-windows/${id}`, {
        method: 'DELETE',
        forceRefreshToken: true,
    }),
}
