import crypto from 'node:crypto'
import { adminDb } from './firebaseAdmin.js'

const sanitizeValue = (value, depth = 0) => {
    if (depth > 3) return '[truncated]'
    if (value === null || value === undefined) return null
    if (typeof value === 'string') return value.trim().slice(0, 500)
    if (typeof value === 'number' || typeof value === 'boolean') return value
    if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1))
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .slice(0, 30)
                .map(([key, item]) => [String(key).slice(0, 80), sanitizeValue(item, depth + 1)]),
        )
    }
    return String(value).slice(0, 200)
}

export const writeAuditLog = async ({
    transaction = null,
    actor = null,
    action,
    entity_type,
    entity_id,
    metadata = {},
}) => {
    const id = crypto.randomUUID()
    const record = {
        id,
        action,
        entity_type,
        entity_id: String(entity_id || '').slice(0, 128),
        actor_uid: actor?.uid || null,
        actor_role: actor?.profile?.role || null,
        metadata: sanitizeValue(metadata),
        created_at: new Date().toISOString(),
    }
    const ref = adminDb.collection('audit_log').doc(id)
    if (transaction) {
        transaction.set(ref, record)
        return record
    }
    await ref.set(record)
    return record
}
