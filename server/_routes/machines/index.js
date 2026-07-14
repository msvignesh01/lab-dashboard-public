import crypto from 'node:crypto'
import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk } from '../../_lib/http.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import {
    canViewMachine,
    isMachineReviewer,
    sanitizeMachinePayload,
} from '../../_lib/machinePolicy.js'
import { runAuditedTransaction } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'POST'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: req.method === 'POST' ? ['faculty', 'admin'] : [],
    })

    if (req.method === 'GET') {
        const reviewer = isMachineReviewer(context.profile)
        const department = typeof req.query?.department === 'string'
            ? req.query.department.trim().slice(0, 100)
            : ''
        const location = typeof req.query?.location === 'string'
            ? req.query.location.trim().slice(0, 200)
            : ''

        const query = reviewer
            ? adminDb.collection('machines')
            : adminDb.collection('machines').where('is_active', '==', true)
        const snapshot = await query.get()
        const machines = snapshot.docs
            .map(fromFirestoreDocument)
            .filter((machine) => canViewMachine(context.profile, machine))
            .filter((machine) => !department || machine.department === department)
            .filter((machine) => !location || machine.location === location)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))

        return sendOk(res, machines)
    }

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

    const machineRef = adminDb.collection('machines').doc(machineId)
    const created = await runAuditedTransaction({
        actor: context,
        mutate: async (transaction) => {
            transaction.create(machineRef, record)
            return {
                result: record,
                audit: {
                    action: 'machine.created',
                    entity_type: 'machine',
                    entity_id: machineId,
                    metadata: {
                        name: record.name,
                        department: record.department,
                        requires_training: record.requires_training,
                    },
                },
            }
        },
    })
    return sendOk(res, created, 201)
})
