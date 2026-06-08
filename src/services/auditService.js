import { apiRequest } from '@/services/apiClient'

export const auditService = {
    getAuditLog: () => apiRequest('/api/audit-log', { forceRefreshToken: true }),
}
