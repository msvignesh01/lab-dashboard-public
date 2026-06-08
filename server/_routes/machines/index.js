import crypto from 'node:crypto'
import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk } from '../../_lib/http.js'
import { sanitizeMachinePayload } from '../../_lib/machinePolicy.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, 'POST')

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'machine_create', limit: 30, windowMs: 60_000 })

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
    await writeAuditLog({
        actor: context,
        action: 'machine.created',
        entity_type: 'machine',
        entity_id: machineId,
        metadata: {
            name: record.name,
            department: record.department,
            requires_training: record.requires_training,
        },
    })
    return sendOk(res, record, 201)
})
