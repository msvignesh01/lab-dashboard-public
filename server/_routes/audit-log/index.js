import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../../_lib/http.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })

    const entityType = typeof req.query?.entity_type === 'string' ? req.query.entity_type.trim() : ''
    const action = typeof req.query?.action === 'string' ? req.query.action.trim() : ''
    const snapshot = await adminDb.collection('audit_log').orderBy('created_at', 'desc').limit(150).get()
    const logs = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((log) => !entityType || log.entity_type === entityType)
        .filter((log) => !action || log.action === action)
        .slice(0, 100)

    return sendOk(res, logs)
})
