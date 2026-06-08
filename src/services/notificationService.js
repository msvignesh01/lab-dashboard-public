import { apiRequest } from '@/services/apiClient'

export const notificationService = {
    getNotifications: () => apiRequest('/api/notifications', { forceRefreshToken: true }),
    markRead: (ids) => apiRequest('/api/notifications', {
        method: 'PATCH',
        body: { ids },
        forceRefreshToken: true,
    }),
}
