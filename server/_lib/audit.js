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

/**
 * Runs a Firestore domain mutation and its audit write in the same transaction.
 *
 * The callback must return both the value exposed to the caller and the audit
 * descriptor. Requiring the descriptor before the transaction callback can
 * resolve prevents a future route from accidentally committing an unaudited
 * mutation.
 */
export const runAuditedTransaction = async ({ actor = null, mutate }) => {
    if (typeof mutate !== 'function') {
        throw new TypeError('An audited transaction requires a mutation callback.')
    }

    return adminDb.runTransaction(async (transaction) => {
        const outcome = await mutate(transaction)
        if (!outcome || typeof outcome !== 'object' || !outcome.audit) {
            throw new Error('Audited transaction did not provide an audit descriptor.')
        }

        const { result, audit } = outcome
        if (!audit.action || !audit.entity_type || !audit.entity_id) {
            throw new Error('Audited transaction provided an incomplete audit descriptor.')
        }

        await writeAuditLog({
            transaction,
            actor,
            action: audit.action,
            entity_type: audit.entity_type,
            entity_id: audit.entity_id,
            metadata: audit.metadata,
        })

        return result
    })
}
