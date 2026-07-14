import { adminDb } from '../../_lib/firebaseAdmin.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { ApiError, assertMethod, handleApi, parseJsonBody, sendOk } from '../../_lib/http.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { sanitizeOwnProfilePatch } from '../../_lib/profilePolicy.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'PATCH'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: false,
    })

    if (req.method === 'GET') return sendOk(res, context.profile)

    await assertRateLimit({ uid: context.uid, action: 'profile_update', limit: 20, windowMs: 60_000 })
    const body = await parseJsonBody(req)

    const profile = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(context.profileRef)
        if (!snapshot.exists) throw new ApiError(404, 'Profile not found.', 'profile_not_found')

        const current = fromFirestoreDocument(snapshot)
        const requestedPatch = sanitizeOwnProfilePatch({
            payload: body,
            role: current.role,
            currentProfile: current,
        })
        const changedPatch = Object.fromEntries(
            Object.entries(requestedPatch).filter(([key, value]) => current[key] !== value),
        )
        const changedFields = Object.keys(changedPatch)
        if (changedFields.length === 0) return current

        const update = {
            ...changedPatch,
            updated_at: new Date().toISOString(),
        }
        transaction.update(context.profileRef, update)
        await writeAuditLog({
            transaction,
            actor: context,
            action: 'profile.updated',
            entity_type: 'profile',
            entity_id: context.uid,
            metadata: { changed_fields: changedFields },
        })
        return { ...current, ...update }
    })

    return sendOk(res, profile)
})
