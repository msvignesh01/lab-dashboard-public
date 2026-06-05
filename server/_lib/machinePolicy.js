import { DEPARTMENTS } from '../../src/lib/constants.js'
import { ApiError } from './http.js'

const isSafeImageUrl = (url) => {
    if (!url) return true
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'https:'
    } catch {
        return false
    }
}

const sanitizeText = (value, maxLength) => {
    return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

const sanitizeSpecifications = (value) => {
    if (value === undefined) return undefined
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ApiError(400, 'Specifications must be an object.', 'invalid_specifications')
    }

    const entries = Object.entries(value).slice(0, 25)
    const result = {}

    for (const [rawKey, rawValue] of entries) {
        const key = sanitizeText(rawKey, 50)
        if (!key) continue

        if (['string', 'number', 'boolean'].includes(typeof rawValue)) {
            result[key] = typeof rawValue === 'string' ? rawValue.trim().slice(0, 200) : rawValue
        }
    }

    return result
}

export const sanitizeMachinePayload = (payload, { partial = false } = {}) => {
    if (!payload || typeof payload !== 'object') {
        throw new ApiError(400, 'Invalid machine data.', 'invalid_machine')
    }

    const data = {}

    if (!partial || payload.name !== undefined) {
        data.name = sanitizeText(payload.name, 200)
        if (!data.name) {
            throw new ApiError(400, 'Machine name is required.', 'missing_machine_name')
        }
    }

    if (!partial || payload.description !== undefined) {
        data.description = sanitizeText(payload.description, 1000)
    }

    if (!partial || payload.department !== undefined) {
        const department = sanitizeText(payload.department, 100)
        if (department && !DEPARTMENTS.includes(department)) {
            throw new ApiError(400, 'Invalid department.', 'invalid_department')
        }
        data.department = department
    }

    if (!partial || payload.location !== undefined) {
        data.location = sanitizeText(payload.location, 200)
    }

    if (!partial || payload.image_url !== undefined) {
        const imageUrl = sanitizeText(payload.image_url, 500)
        if (!isSafeImageUrl(imageUrl)) {
            throw new ApiError(400, 'Image URL must use HTTPS.', 'invalid_image_url')
        }
        data.image_url = imageUrl
    }

    if (!partial || payload.specifications !== undefined) {
        data.specifications = sanitizeSpecifications(payload.specifications || {})
    }

    if (!partial || payload.is_active !== undefined) {
        data.is_active = typeof payload.is_active === 'boolean' ? payload.is_active : true
    }

    if (!partial || payload.requires_training !== undefined) {
        data.requires_training = typeof payload.requires_training === 'boolean' ? payload.requires_training : false
    }

    if (partial && Object.keys(data).length === 0) {
        throw new ApiError(400, 'No valid fields to update.', 'empty_update')
    }

    return data
}
