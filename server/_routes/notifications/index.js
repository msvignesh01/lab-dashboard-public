import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'PATCH'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
    })

    if (req.method === 'GET') {
        try {
            const snapshot = await adminDb
                .collection('notifications')
                .where('user_id', '==', context.uid)
                .orderBy('created_at', 'desc')
                .limit(50)
                .get()
            return sendOk(res, snapshot.docs.map(fromFirestoreDocument))
        } catch (err) {
            // Fallback if the (user_id, created_at) composite index is not deployed yet:
            // fetch the user's notifications and sort newest-first in memory so the
            // notification center still works instead of returning a 500.
            if (err?.code === 9 || err?.code === 'failed-precondition') {
                const snap = await adminDb.collection('notifications').where('user_id', '==', context.uid).get()
                const items = snap.docs
                    .map(fromFirestoreDocument)
                    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
                    .slice(0, 50)
                return sendOk(res, items)
            }
            throw err
        }
    }

    const body = await parseJsonBody(req)
    const ids = Array.isArray(body.ids) ? body.ids.filter(isValidFirestoreId).slice(0, 50) : []
    if (ids.length === 0) {
        throw new ApiError(400, 'No valid notifications selected.', 'invalid_notification_ids')
    }

    const timestamp = new Date().toISOString()
    const batch = adminDb.batch()
    for (const id of ids) {
        const ref = adminDb.collection('notifications').doc(id)
        const snap = await ref.get()
        if (snap.exists && snap.data().user_id === context.uid) {
            batch.set(ref, { read_at: timestamp, updated_at: timestamp }, { merge: true })
        }
    }
    await batch.commit()

    return sendOk(res, { ids, read_at: timestamp })
})
