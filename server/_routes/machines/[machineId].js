import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import { canViewMachine, sanitizeMachinePayload } from '../../_lib/machinePolicy.js'
import { runAuditedTransaction } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'

const nowIso = () => new Date().toISOString()

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'PATCH', 'DELETE'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: req.method === 'GET' ? [] : ['faculty', 'admin'],
    })

    if (req.method !== 'GET') {
        await assertRateLimit({ uid: context.uid, action: `machine_${req.method.toLowerCase()}`, limit: 40, windowMs: 60_000 })
    }

    const machineId = getRouteParam(req, 'machineId')
    if (!isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Invalid machine ID.', 'invalid_machine_id')
    }

    const machineRef = adminDb.collection('machines').doc(machineId)
    if (req.method === 'GET') {
        const machineSnap = await machineRef.get()
        if (!machineSnap.exists) {
            throw new ApiError(404, 'Machine not found.', 'machine_not_found')
        }

        const machine = fromFirestoreDocument(machineSnap)
        if (!canViewMachine(context.profile, machine)) {
            throw new ApiError(404, 'Machine not found.', 'machine_not_found')
        }
        return sendOk(res, machine)
    }

    if (req.method === 'PATCH') {
        const body = await parseJsonBody(req)
        const update = {
            ...sanitizeMachinePayload(body, { partial: true }),
            updated_at: nowIso(),
        }

        const updatedMachine = await runAuditedTransaction({
            actor: context,
            mutate: async (transaction) => {
                const machineSnap = await transaction.get(machineRef)
                if (!machineSnap.exists) {
                    throw new ApiError(404, 'Machine not found.', 'machine_not_found')
                }

                const nextMachine = {
                    ...fromFirestoreDocument(machineSnap),
                    ...update,
                }
                transaction.update(machineRef, update)
                return {
                    result: nextMachine,
                    audit: {
                        action: 'machine.updated',
                        entity_type: 'machine',
                        entity_id: machineId,
                        metadata: { fields: Object.keys(update) },
                    },
                }
            },
        })
        return sendOk(res, updatedMachine)
    }

    const historicalBookingsQuery = adminDb
        .collection('bookings')
        .where('machine_id', '==', machineId)
        .limit(1)

    const outcome = await runAuditedTransaction({
        actor: context,
        mutate: async (transaction) => {
            const machineSnap = await transaction.get(machineRef)
            if (!machineSnap.exists) {
                throw new ApiError(404, 'Machine not found.', 'machine_not_found')
            }

            const historicalBookings = await transaction.get(historicalBookingsQuery)
            if (!historicalBookings.empty) {
                const update = {
                    is_active: false,
                    updated_at: nowIso(),
                }
                const nextMachine = {
                    ...fromFirestoreDocument(machineSnap),
                    ...update,
                }
                transaction.update(machineRef, update)
                return {
                    result: {
                        deleted: false,
                        machine: nextMachine,
                        message: 'Machine has historical bookings and was deactivated instead of deleted.',
                    },
                    audit: {
                        action: 'machine.deactivated',
                        entity_type: 'machine',
                        entity_id: machineId,
                        metadata: { historical_bookings: true },
                    },
                }
            }

            transaction.delete(machineRef)
            return {
                result: { deleted: true, id: machineId },
                audit: {
                    action: 'machine.deleted',
                    entity_type: 'machine',
                    entity_id: machineId,
                    metadata: { historical_bookings: false },
                },
            }
        },
    })
    return sendOk(res, outcome)
})
