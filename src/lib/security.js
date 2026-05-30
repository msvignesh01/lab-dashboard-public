// Security utilities for production-grade frontend
export const securityUtils = {
    // Sanitize user inputs to prevent XSS
    sanitizeInput: (input) => {
        if (typeof input !== 'string') return input
        return input
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
    },

    // Validate email format
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(email)
    },

    // Mask sensitive data for logging
    maskSensitiveData: (data) => {
        if (typeof data === 'string' && data.includes('@')) {
            return data.replace(/(.{2})[^@]*@/, '$1***@')
        }
        if (typeof data === 'object' && data !== null) {
            const masked = { ...data }
            if (masked.email) masked.email = securityUtils.maskSensitiveData(masked.email)
            if (masked.phone) masked.phone = '***-***-****'
            return masked
        }
        return data
    },

    // Secure logging - only in development
    secureLog: (level, message, data = null) => {
        if (import.meta.env.DEV) {
            const maskedData = data ? securityUtils.maskSensitiveData(data) : null
            console[level](`[SECURE] ${message}`, maskedData || '') // eslint-disable-line no-console
        }
    },

    // Validate user permissions
    hasPermission: (user, requiredRole) => {
        if (!user || !user.role) return false
        const roleHierarchy = { student: 1, faculty: 2, admin: 3 }
        return roleHierarchy[user.role] >= roleHierarchy[requiredRole]
    },

    // Clear sensitive data from memory
    clearSensitiveData: () => {
        // Clear any sensitive data from global scope
        if (window.sensitiveData) {
            delete window.sensitiveData
        }
    },

    // Generate secure random ID
    generateSecureId: () => {
        return crypto.getRandomValues(new Uint8Array(16)).reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '')
    },

    // Validate API response data
    validateApiResponse: (response, expectedFields = []) => {
        if (!response || typeof response !== 'object') return false

        // Check for expected fields
        for (const field of expectedFields) {
            if (!(field in response)) return false
        }

        // Check for malicious content
        const stringFields = Object.values(response).filter(val => typeof val === 'string')
        for (const field of stringFields) {
            if (field.includes('<script') || field.includes('javascript:')) {
                return false
            }
        }

        return true
    },

    // Validate UUID format
    validateUUID: (uuid) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        return typeof uuid === 'string' && uuidRegex.test(uuid)
    },

    // Validate Firestore document IDs / Firebase Auth UIDs
    validateFirestoreId: (id) => {
        return typeof id === 'string'
            && id.length > 0
            && id.length <= 128
            && id !== '.'
            && id !== '..'
            && !id.includes('/')
            && !/^__.*__$/.test(id)
    },

    // Validate URL format
    validateUrl: (url) => {
        try {
            new URL(url)
            return url.startsWith('http://') || url.startsWith('https://')
        } catch {
            return false
        }
    },

    // Validate phone number format (basic validation)
    validatePhoneNumber: (phone) => {
        // Allow international format with + and numbers, spaces, hyphens
        const phoneRegex = /^\+?[\d\s\-()]{10,15}$/
        return typeof phone === 'string' && phoneRegex.test(phone.replace(/\s/g, ''))
    },

    // Enhanced email validation (more strict than basic)
    validateEmail: (email) => {
        if (!email || typeof email !== 'string') return false

        // Basic format check
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(email)) return false

        // Length checks
        if (email.length > 254) return false

        // Domain-specific validation for university emails
        const universityDomains = ['btech.christuniversity.in', 'christuniversity.in']
        const domain = email.split('@')[1]?.toLowerCase()

        if (domain && universityDomains.includes(domain)) {
            // Additional validation for university emails
            const localPart = email.split('@')[0]
            if (localPart.length < 2 || localPart.length > 50) return false
            if (!/^[a-zA-Z0-9._-]+$/.test(localPart)) return false
        }

        return true
    },

    // Sanitize an object's string values
    sanitizeObject: (obj) => {
        if (!obj || typeof obj !== 'object') return {}
        const sanitized = {}
        for (const [key, value] of Object.entries(obj)) {
            if (typeof value === 'string') {
                sanitized[key] = securityUtils.sanitizeInput(value)
            } else {
                sanitized[key] = value
            }
        }
        return sanitized
    },

    // Mask email for logging
    maskEmail: (email) => {
        if (typeof email !== 'string' || !email.includes('@')) return '***'
        return email.replace(/(.{2})[^@]*@/, '$1***@')
    },

    // Enhanced password validation
    validatePassword: (password) => {
        if (!password || typeof password !== 'string') return false
        if (password.length < 8) return false

        // Check for required character types
        const hasUpperCase = /[A-Z]/.test(password)
        const hasLowerCase = /[a-z]/.test(password)
        const hasNumbers = /\d/.test(password)
        const hasSpecialChar = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?/]/.test(password)

        return hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar
    },

    // Validate image URLs — HTTPS only in production to prevent mixed-content and MITM
    isSafeImageUrl: (url) => {
        if (!url || typeof url !== 'string') return false
        try {
            const parsed = new URL(url)
            return parsed.protocol === 'https:'
        } catch {
            return false
        }
    },

    // Hash email for avatar services to avoid leaking raw email addresses
    hashForAvatar: async (email) => {
        if (!email || typeof email !== 'string') return 'default'
        try {
            const msgBuffer = new TextEncoder().encode(email.trim().toLowerCase())
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        } catch {
            return 'default'
        }
    }
}

// Security: Clear sensitive data on page unload
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        securityUtils.clearSensitiveData()
    })
}
