import { adminDb } from './firebaseAdmin.js'
import { ApiError } from './http.js'

export const assertRateLimit = async ({ uid, action, limit = 30, windowMs = 60_000 }) => {
    if (!uid || !action) return

    const windowId = Math.floor(Date.now() / windowMs)
    const id = `${uid}_${action}_${windowId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 180)
    const ref = adminDb.collection('rate_limits').doc(id)

    await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref)
        const count = snap.exists ? Number(snap.data().count || 0) : 0
        if (count >= limit) {
            throw new ApiError(429, 'Too many requests. Please wait and try again.', 'rate_limited')
        }
        transaction.set(ref, {
            id,
            uid,
            action,
            count: count + 1,
            window_id: windowId,
            expires_at: new Date((windowId + 2) * windowMs).toISOString(),
            updated_at: new Date().toISOString(),
        }, { merge: true })
    })
}
