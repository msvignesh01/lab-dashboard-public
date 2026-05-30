import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    where,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { securityUtils } from '@/lib/security'
import { apiRequest } from '@/services/apiClient'

const toServiceError = (err, fallback = 'An unexpected error occurred') => {
    if (err?.code === 'permission-denied') {
        return { message: 'You do not have permission to perform this action.', code: err.code }
    }

    if (['failed-precondition', 'unavailable', 'internal', 'resource-exhausted'].includes(err?.code)) {
        return { message: 'The service is temporarily unavailable. Please try again later.', code: err.code }
    }

    return {
        message: typeof err?.message === 'string' && err.message.trim() ? err.message : fallback,
        code: err?.code,
    }
}

const fromDoc = (docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
})

const sortByName = (machines) => machines.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

export const machineService = {
    /**
     * Get all machines with security validation
     * @param {object} [filters] - { department, location, isAdmin }
     */
    getMachines: async (filters = {}) => {
        try {
            const sanitizedFilters = {}

            if (filters.department) {
                sanitizedFilters.department = typeof filters.department === 'string' ? filters.department.trim().substring(0, 100) : ''
            }

            if (filters.location) {
                sanitizedFilters.location = typeof filters.location === 'string' ? filters.location.trim().substring(0, 100) : ''
            }

            if (typeof filters.isAdmin === 'boolean') {
                sanitizedFilters.isAdmin = filters.isAdmin
            }

            const constraints = []

            if (!sanitizedFilters.isAdmin) {
                constraints.push(where('is_active', '==', true))
            }

            if (sanitizedFilters.department) {
                constraints.push(where('department', '==', sanitizedFilters.department))
            }

            if (sanitizedFilters.location) {
                constraints.push(where('location', '==', sanitizedFilters.location))
            }

            const machinesQuery = constraints.length > 0
                ? query(collection(firestore, 'machines'), ...constraints)
                : collection(firestore, 'machines')

            const snapshot = await getDocs(machinesQuery)
            const data = sortByName(snapshot.docs.map(fromDoc))

            return { data, error: null }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in getMachines', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Get single machine details with security validation
     * @param {string} machineId
     */
    getMachineDetails: async (machineId) => {
        try {
            if (!securityUtils.validateFirestoreId(machineId)) {
                return { data: null, error: { message: 'Invalid machine ID' } }
            }

            const machineSnap = await getDoc(doc(firestore, 'machines', machineId))

            if (!machineSnap.exists()) {
                return { data: null, error: { message: 'Machine not found' } }
            }

            return { data: fromDoc(machineSnap), error: null }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in getMachineDetails', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Create machine with security validation (admin/faculty only)
     * @param {object} machineData
     */
    createMachine: async (machineData) => {
        try {
            if (!machineData || typeof machineData !== 'object') {
                return { data: null, error: { message: 'Invalid machine data' } }
            }

            const sanitizedData = {
                name: typeof machineData.name === 'string' ? machineData.name.trim().substring(0, 200) : '',
                description: typeof machineData.description === 'string' ? machineData.description.trim().substring(0, 1000) : '',
                department: typeof machineData.department === 'string' ? machineData.department.trim().substring(0, 100) : '',
                location: typeof machineData.location === 'string' ? machineData.location.trim().substring(0, 200) : '',
                specifications: machineData.specifications || {},
                image_url: typeof machineData.image_url === 'string' ? machineData.image_url.trim().substring(0, 500) : '',
                is_active: typeof machineData.is_active === 'boolean' ? machineData.is_active : true,
                requires_training: typeof machineData.requires_training === 'boolean' ? machineData.requires_training : false,
            }

            if (!sanitizedData.name) {
                return { data: null, error: { message: 'Machine name is required' } }
            }

            if (sanitizedData.image_url && !securityUtils.isSafeImageUrl(sanitizedData.image_url)) {
                return { data: null, error: { message: 'Image URL must use HTTPS' } }
            }

            if (sanitizedData.specifications && typeof sanitizedData.specifications !== 'object') {
                return { data: null, error: { message: 'Specifications must be a valid object' } }
            }

            securityUtils.secureLog('info', 'Creating machine', {
                name: sanitizedData.name,
                department: sanitizedData.department,
            })

            return apiRequest('/api/machines', {
                method: 'POST',
                body: sanitizedData,
                forceRefreshToken: true,
            })
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in createMachine', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Update machine with security validation (admin/faculty only)
     * @param {string} machineId
     * @param {object} updates
     */
    updateMachine: async (machineId, updates) => {
        try {
            if (!securityUtils.validateFirestoreId(machineId)) {
                return { data: null, error: { message: 'Invalid machine ID' } }
            }

            if (!updates || typeof updates !== 'object') {
                return { data: null, error: { message: 'Invalid update data' } }
            }

            const sanitizedUpdates = {}

            if (updates.name !== undefined) {
                sanitizedUpdates.name = typeof updates.name === 'string' ? updates.name.trim().substring(0, 200) : ''
            }

            if (updates.description !== undefined) {
                sanitizedUpdates.description = typeof updates.description === 'string' ? updates.description.trim().substring(0, 1000) : ''
            }

            if (updates.department !== undefined) {
                sanitizedUpdates.department = typeof updates.department === 'string' ? updates.department.trim().substring(0, 100) : ''
            }

            if (updates.location !== undefined) {
                sanitizedUpdates.location = typeof updates.location === 'string' ? updates.location.trim().substring(0, 200) : ''
            }

            if (updates.specifications !== undefined) {
                if (typeof updates.specifications !== 'object') {
                    return { data: null, error: { message: 'Specifications must be a valid object' } }
                }
                sanitizedUpdates.specifications = updates.specifications
            }

            if (updates.image_url !== undefined) {
                const cleanedUrl = typeof updates.image_url === 'string' ? updates.image_url.trim().substring(0, 500) : ''
                if (cleanedUrl && !securityUtils.isSafeImageUrl(cleanedUrl)) {
                    return { data: null, error: { message: 'Image URL must use HTTPS' } }
                }
                sanitizedUpdates.image_url = cleanedUrl
            }

            if (typeof updates.is_active === 'boolean') {
                sanitizedUpdates.is_active = updates.is_active
            }

            if (typeof updates.requires_training === 'boolean') {
                sanitizedUpdates.requires_training = updates.requires_training
            }

            if (Object.keys(sanitizedUpdates).length === 0) {
                return { data: null, error: { message: 'No valid fields to update' } }
            }

            securityUtils.secureLog('info', 'Updating machine', {
                machine_id: machineId,
                fields: Object.keys(sanitizedUpdates),
            })

            return apiRequest(`/api/machines/${machineId}`, {
                method: 'PATCH',
                body: sanitizedUpdates,
                forceRefreshToken: true,
            })
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in updateMachine', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Delete machine with security validation (admin/faculty only)
     * @param {string} machineId
     */
    deleteMachine: async (machineId) => {
        try {
            if (!securityUtils.validateFirestoreId(machineId)) {
                return { error: { message: 'Invalid machine ID' } }
            }

            securityUtils.secureLog('info', 'Deleting machine', { machine_id: machineId })

            const { error, data } = await apiRequest(`/api/machines/${machineId}`, {
                method: 'DELETE',
                forceRefreshToken: true,
            })

            return { error, data }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in deleteMachine', err.message)
            return { error: toServiceError(err) }
        }
    },
}
