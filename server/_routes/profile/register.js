import { adminAuth, adminDb } from '../../_lib/firebaseAdmin.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { verifyFirebaseIdToken } from '../../_lib/authPolicy.js'
import {
    ApiError,
    assertMethod,
    getBearerToken,
    handleApi,
    parseJsonBody,
    sendOk,
} from '../../_lib/http.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import {
    assertIdempotentRegistration,
    buildRegistrationProfile,
} from '../../_lib/profilePolicy.js'

export default handleApi(async (req, res) => {
    assertMethod(req, 'POST')

    const decodedToken = await verifyFirebaseIdToken(adminAuth, getBearerToken(req))
    if (!decodedToken?.uid || !decodedToken?.email) {
        throw new ApiError(401, 'Authentication required', 'invalid_auth_token')
    }
    await assertRateLimit({
        uid: decodedToken.uid,
        action: 'profile_registration',
        limit: 10,
        windowMs: 10 * 60_000,
    })

    const body = await parseJsonBody(req)
    const registrationProfile = buildRegistrationProfile({ decodedToken, payload: body })
    const profileRef = adminDb.collection('profiles').doc(decodedToken.uid)

    const outcome = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(profileRef)
        if (snapshot.exists) {
            const existingProfile = fromFirestoreDocument(snapshot)
            assertIdempotentRegistration({ existingProfile, registrationProfile })
            return { profile: existingProfile, created: false }
        }

        transaction.set(profileRef, registrationProfile)
        await writeAuditLog({
            transaction,
            actor: { uid: decodedToken.uid, profile: { role: registrationProfile.role } },
            action: 'profile.registered',
            entity_type: 'profile',
            entity_id: decodedToken.uid,
            metadata: {
                requested_role: registrationProfile.requested_role,
                status: registrationProfile.status,
            },
        })

        return { profile: registrationProfile, created: true }
    })

    return sendOk(res, outcome, outcome.created ? 201 : 200)
})
