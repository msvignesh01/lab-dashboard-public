import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../_lib/http.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })

    const snapshot = await adminDb
        .collection('profiles')
        .where('status', '==', 'pending_approval')
        .where('requested_role', '==', 'faculty')
        .get()

    const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))

    return sendOk(res, requests)
})
