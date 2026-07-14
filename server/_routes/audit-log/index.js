import { FieldPath } from 'firebase-admin/firestore'
import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../../_lib/http.js'
import {
    buildAuditListQuery,
    parseAuditListParams,
    toAuditPage,
} from '../../_lib/auditQuery.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })

    const params = parseAuditListParams(req.query)
    const query = buildAuditListQuery(
        adminDb.collection('audit_log'),
        params,
        FieldPath.documentId(),
    )
    const snapshot = await query.get()
    const { logs, nextCursor } = toAuditPage(snapshot, params, context.profile.role)

    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('X-Audit-Next-Cursor', nextCursor || '')

    return sendOk(res, logs)
})
