import { apiRequest } from '@/services/apiClient'

export const profileService = {
    getPendingFacultyRequests: () => apiRequest('/api/profile/faculty-requests', {
        forceRefreshToken: true,
    }),

    approveFacultyRequest: (userId) => apiRequest(`/api/profile/${userId}/approve`, {
        method: 'PATCH',
        forceRefreshToken: true,
    }),

    rejectFacultyRequest: (userId, reason) => apiRequest(`/api/profile/${userId}/reject`, {
        method: 'PATCH',
        body: { reason },
        forceRefreshToken: true,
    }),
}
