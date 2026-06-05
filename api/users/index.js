import { adminAuth, adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../_lib/http.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'GET')

    await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['admin'],
    })

    const status = typeof req.query?.status === 'string' ? req.query.status : ''
    const role = typeof req.query?.role === 'string' ? req.query.role : ''

    const snapshot = await adminDb.collection('profiles').limit(200).get()
    const profiles = await Promise.all(snapshot.docs.map(async (doc) => {
        const profile = { id: doc.id, ...doc.data() }
        try {
            const user = await adminAuth.getUser(doc.id)
            return {
                ...profile,
                auth_disabled: user.disabled === true,
                auth_email_verified: user.emailVerified === true,
            }
        } catch {
            return {
                ...profile,
                auth_disabled: null,
                auth_email_verified: null,
            }
        }
    }))

    const filtered = profiles
        .filter((profile) => !status || profile.status === status)
        .filter((profile) => !role || profile.role === role)
        .slice(0, 100)

    return sendOk(res, filtered.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''))))
})
