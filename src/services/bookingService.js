import {
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    where,
} from 'firebase/firestore'
import { firestore } from '@/lib/firebase'
import { securityUtils } from '@/lib/security'
import { parseTimeToMinute, validateBookingWindow } from '@/lib/bookingValidation'
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

const sortBookingsByDate = (bookings) => bookings.sort((a, b) => {
    const aValue = `${a.booking_date || ''}T${a.start_time || ''}`
    const bValue = `${b.booking_date || ''}T${b.start_time || ''}`
    return aValue.localeCompare(bValue)
})

const sortBookingsByCreatedDesc = (bookings) => bookings.sort((a, b) => {
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
})

const getSlotMinutes = (booking) => {
    const startMinute = parseTimeToMinute(booking.start_time)
    const endMinute = parseTimeToMinute(booking.end_time)

    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || startMinute >= endMinute) {
        return []
    }

    const minutes = []
    for (let minute = startMinute; minute < endMinute; minute += 1) {
        minutes.push(minute)
    }
    return minutes
}

const fetchDocsById = async (collectionName, ids) => {
    const validIds = [...new Set(ids.filter((id) => securityUtils.validateFirestoreId(id)))]
    const entries = await Promise.all(validIds.map(async (id) => {
        try {
            const snap = await getDoc(doc(firestore, collectionName, id))
            return [id, snap.exists() ? fromDoc(snap) : null]
        } catch (err) {
            securityUtils.secureLog('warn', `Unable to enrich ${collectionName} record`, err.message)
            return [id, null]
        }
    }))
    return new Map(entries)
}

const enrichBookings = async (bookings, { includeMachines = true, includeProfiles = false } = {}) => {
    const machineMap = includeMachines
        ? await fetchDocsById('machines', bookings.map((booking) => booking.machine_id))
        : new Map()
    const profileMap = includeProfiles
        ? await fetchDocsById('profiles', bookings.map((booking) => booking.student_id))
        : new Map()

    return bookings.map((booking) => ({
        ...booking,
        ...(includeMachines ? { machines: machineMap.get(booking.machine_id) || null } : {}),
        ...(includeProfiles ? { profiles: profileMap.get(booking.student_id) || null } : {}),
    }))
}

export const bookingService = {
    getAvailability: async (machineId, date) => {
        if (!securityUtils.validateFirestoreId(machineId)) {
            return { data: null, error: { message: 'Invalid machine ID' } }
        }
        return apiRequest(`/api/machines/${machineId}/availability?date=${encodeURIComponent(date)}`, {
            forceRefreshToken: true,
        })
    },

    getBookings: async (params = {}) => {
        const search = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
            if (value) search.set(key, value)
        }
        return apiRequest(`/api/bookings${search.toString() ? `?${search.toString()}` : ''}`, {
            forceRefreshToken: true,
        })
    },

    /**
     * Create a new booking with security validation
     * @param {object} bookingData - { machine_id, student_id, booking_date, start_time, end_time, purpose }
     */
    createBooking: async (bookingData) => {
        try {
            if (!bookingData || typeof bookingData !== 'object') {
                return { data: null, error: { message: 'Invalid booking data' } }
            }

            const sanitizedData = {
                machine_id: bookingData.machine_id,
                student_id: bookingData.student_id,
                booking_date: bookingData.booking_date,
                start_time: bookingData.start_time,
                end_time: bookingData.end_time,
                purpose: typeof bookingData.purpose === 'string' ? bookingData.purpose.trim().substring(0, 500) : '',
                status: 'pending',
            }

            if (!sanitizedData.machine_id || !sanitizedData.student_id ||
                !sanitizedData.booking_date || !sanitizedData.start_time ||
                !sanitizedData.end_time || !sanitizedData.purpose) {
                return { data: null, error: { message: 'All booking fields are required' } }
            }

            if (!securityUtils.validateFirestoreId(sanitizedData.machine_id) ||
                !securityUtils.validateFirestoreId(sanitizedData.student_id)) {
                return { data: null, error: { message: 'Invalid ID format' } }
            }

            const windowValidation = validateBookingWindow(sanitizedData)
            if (!windowValidation.valid) {
                return { data: null, error: { message: windowValidation.message } }
            }

            const slotCount = getSlotMinutes(sanitizedData).length
            if (slotCount === 0 || slotCount > 480) {
                return { data: null, error: { message: 'Invalid booking duration' } }
            }

            securityUtils.secureLog('info', 'Creating booking', {
                machine_id: sanitizedData.machine_id,
                student_id: sanitizedData.student_id,
                date: sanitizedData.booking_date,
            })

            return apiRequest('/api/bookings', {
                method: 'POST',
                body: sanitizedData,
                forceRefreshToken: true,
            })
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in createBooking', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Get bookings for a specific user with security validation
     * @param {string} userId
     */
    getMyBookings: async (userId) => {
        try {
            if (!securityUtils.validateFirestoreId(userId)) {
                return { data: null, error: { message: 'Invalid user ID' } }
            }

            const bookingsQuery = query(collection(firestore, 'bookings'), where('student_id', '==', userId))
            const snapshot = await getDocs(bookingsQuery)
            const bookings = sortBookingsByDate(snapshot.docs.map(fromDoc))
            const data = await enrichBookings(bookings, { includeMachines: true })

            return { data, error: null }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in getMyBookings', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Subscribe to a user's bookings with Firebase realtime updates.
     * @param {string} userId
     * @param {(data: Array) => void} onData
     * @param {(error: Error) => void} onError
     */
    subscribeToMyBookings: (userId, onData, onError) => {
        if (!securityUtils.validateFirestoreId(userId)) {
            onError?.(new Error('Invalid user ID'))
            return () => {}
        }

        let active = true
        const bookingsQuery = query(collection(firestore, 'bookings'), where('student_id', '==', userId))
        const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = sortBookingsByDate(snapshot.docs.map(fromDoc))
            enrichBookings(bookings, { includeMachines: true })
                .then((data) => {
                    if (active) onData(data)
                })
                .catch((err) => {
                    if (active) onError?.(err)
                })
        }, (err) => {
            if (active) onError?.(err)
        })

        return () => {
            active = false
            unsubscribe()
        }
    },

    /**
     * Get all pending bookings (for faculty) with security validation
     */
    getPendingBookings: async () => {
        try {
            const bookingsQuery = query(collection(firestore, 'bookings'), where('status', '==', 'pending'))
            const snapshot = await getDocs(bookingsQuery)
            const bookings = sortBookingsByCreatedDesc(snapshot.docs.map(fromDoc))
            const data = await enrichBookings(bookings, { includeMachines: true, includeProfiles: true })

            return { data, error: null }
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in getPendingBookings', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Subscribe to pending bookings with Firebase realtime updates.
     * @param {(data: Array) => void} onData
     * @param {(error: Error) => void} onError
     */
    subscribeToPendingBookings: (onData, onError) => {
        let active = true
        const bookingsQuery = query(collection(firestore, 'bookings'), where('status', '==', 'pending'))
        const unsubscribe = onSnapshot(bookingsQuery, (snapshot) => {
            const bookings = sortBookingsByCreatedDesc(snapshot.docs.map(fromDoc))
            enrichBookings(bookings, { includeMachines: true, includeProfiles: true })
                .then((data) => {
                    if (active) onData(data)
                })
                .catch((err) => {
                    if (active) onError?.(err)
                })
        }, (err) => {
            if (active) onError?.(err)
        })

        return () => {
            active = false
            unsubscribe()
        }
    },

    /**
     * Update booking status with security validation
     * @param {string} bookingId
     * @param {string} status - 'approved' or 'rejected'
     * @param {string} [comments]
     */
    updateBookingStatus: async (bookingId, status, comments) => {
        try {
            if (!securityUtils.validateFirestoreId(bookingId)) {
                return { data: null, error: { message: 'Invalid booking ID' } }
            }

            const validStatuses = ['approved', 'rejected']
            if (!status || !validStatuses.includes(status)) {
                return { data: null, error: { message: 'Invalid status' } }
            }

            securityUtils.secureLog('info', 'Updating booking status', {
                booking_id: bookingId,
                status,
            })

            return apiRequest(`/api/bookings/${bookingId}/review`, {
                method: 'PATCH',
                body: { status, comments },
                forceRefreshToken: true,
            })
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in updateBookingStatus', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },

    /**
     * Cancel booking with security validation
     * @param {string} bookingId
     * @param {string} userId - User making the cancellation
     */
    cancelBooking: async (bookingId, userId) => {
        try {
            if (!securityUtils.validateFirestoreId(bookingId)) {
                return { data: null, error: { message: 'Invalid booking ID' } }
            }

            if (!securityUtils.validateFirestoreId(userId)) {
                return { data: null, error: { message: 'Invalid user ID' } }
            }

            securityUtils.secureLog('info', 'Cancelling booking', {
                booking_id: bookingId,
                user_id: userId,
            })

            return apiRequest(`/api/bookings/${bookingId}/cancel`, {
                method: 'PATCH',
                forceRefreshToken: true,
            })
        } catch (err) {
            securityUtils.secureLog('error', 'Unexpected error in cancelBooking', err.message)
            return { data: null, error: toServiceError(err) }
        }
    },
}
