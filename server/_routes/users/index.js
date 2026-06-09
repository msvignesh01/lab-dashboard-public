import { adminAuth, adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, sendOk } from '../../_lib/http.js'

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
    const profileDocs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

    // Batch Firebase Auth lookups (max 100 identifiers per getUsers call) instead of
    // one getUser request per profile. The per-profile approach is slow and can exceed
    // the serverless function timeout once the user base grows.
    const authByUid = new Map()
    for (let i = 0; i < profileDocs.length; i += 100) {
        const chunk = profileDocs.slice(i, i + 100)
        try {
            const result = await adminAuth.getUsers(chunk.map((profile) => ({ uid: profile.id })))
            for (const user of result.users) {
                authByUid.set(user.uid, user)
            }
        } catch {
            // Leave this chunk's auth metadata unresolved; reported as null below.
        }
    }

    const profiles = profileDocs.map((profile) => {
        const user = authByUid.get(profile.id)
        return {
            ...profile,
            auth_disabled: user ? user.disabled === true : null,
            auth_email_verified: user ? user.emailVerified === true : null,
        }
    })

    const filtered = profiles
        .filter((profile) => !status || profile.status === status)
        .filter((profile) => !role || profile.role === role)
        .slice(0, 100)

    return sendOk(res, filtered.sort((a, b) => String(a.email || '').localeCompare(String(b.email || ''))))
})
