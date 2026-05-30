import crypto from 'node:crypto'
import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk } from '../_lib/http.js'
import { sanitizeMachinePayload } from '../_lib/machinePolicy.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'POST')

    await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })

    const body = await parseJsonBody(req)
    const machineId = crypto.randomUUID()
    const timestamp = nowIso()
    const record = {
        id: machineId,
        ...sanitizeMachinePayload(body),
        created_at: timestamp,
        updated_at: timestamp,
    }

    await adminDb.collection('machines').doc(machineId).create(record)
    return sendOk(res, record, 201)
})
