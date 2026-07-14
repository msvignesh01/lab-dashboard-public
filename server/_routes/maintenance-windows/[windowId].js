import { adminDb, FieldValue } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, getRouteParam, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import { writeAuditLog } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { LAB_TIMEZONE_OFFSET_MINUTES } from '../../_lib/labConfig.js'
import {
    assertMaintenanceHasNoBookingConflict,
    getMaintenanceBookingDateBounds,
    getScheduleGuardRefs,
    transactionGetAll,
} from '../../_lib/schedulePolicy.js'

export default handleApi(async (req, res) => {
    assertMethod(req, ['PATCH', 'DELETE'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })
    await assertRateLimit({ uid: context.uid, action: 'maintenance_update', limit: 30, windowMs: 60_000 })

    const windowId = getRouteParam(req, 'windowId')
    if (!isValidFirestoreId(windowId)) {
        throw new ApiError(400, 'Invalid maintenance ID.', 'invalid_maintenance_id')
    }

    const body = req.method === 'PATCH' ? await parseJsonBody(req) : {}
    if (body.status !== undefined && !['active', 'cancelled'].includes(body.status)) {
        throw new ApiError(400, 'Invalid maintenance status.', 'invalid_maintenance_status')
    }

    const ref = adminDb.collection('maintenance_windows').doc(windowId)
    let updated = null

    await adminDb.runTransaction(async (transaction) => {
        const snap = await transaction.get(ref)
        if (!snap.exists) {
            throw new ApiError(404, 'Maintenance window not found.', 'maintenance_not_found')
        }

        const current = fromFirestoreDocument(snap)
        const nextStatus = req.method === 'DELETE'
            ? 'cancelled'
            : body.status ?? current.status
        if (!['active', 'cancelled'].includes(nextStatus)) {
            throw new ApiError(409, 'Stored maintenance status is invalid.', 'maintenance_state_invalid')
        }
        const update = {
            status: nextStatus,
            ...(req.method === 'PATCH' && typeof body.reason === 'string' && body.reason.trim()
                ? { reason: body.reason.trim().slice(0, 300) }
                : {}),
            updated_at: new Date().toISOString(),
        }

        if (current.status !== 'active' && nextStatus === 'active') {
            const activationScope = current.scope === 'global' || !current.machine_id ? 'global' : 'machine'
            const guardRefs = getScheduleGuardRefs(adminDb, {
                machineId: current.machine_id,
                scope: activationScope,
            })
            const machineRef = activationScope === 'machine'
                ? adminDb.collection('machines').doc(current.machine_id)
                : null
            const snapshots = await transactionGetAll(transaction, [
                ...guardRefs,
                ...(machineRef ? [machineRef] : []),
            ])
            if (machineRef && !snapshots[guardRefs.length]?.exists) {
                throw new ApiError(404, 'Machine not found.', 'machine_not_found')
            }

            const activation = { ...current, scope: activationScope, ...update }
            const { dateFrom, dateTo } = getMaintenanceBookingDateBounds(
                activation,
                LAB_TIMEZONE_OFFSET_MINUTES,
            )
            const bookingsSnap = await transaction.get(
                adminDb.collection('bookings')
                    .where('booking_date', '>=', dateFrom)
                    .where('booking_date', '<=', dateTo),
            )
            assertMaintenanceHasNoBookingConflict({
                maintenance: activation,
                bookings: bookingsSnap.docs.map(fromFirestoreDocument),
                timezoneOffsetMinutes: LAB_TIMEZONE_OFFSET_MINUTES,
            })

            for (const guardRef of guardRefs) {
                transaction.set(guardRef, {
                    version: FieldValue.increment(1),
                    machine_id: guardRef.id === 'global' ? null : current.machine_id,
                    updated_at: update.updated_at,
                    updated_by: context.uid,
                }, { merge: true })
            }
        }

        transaction.set(ref, update, { merge: true })
        updated = { ...current, ...update }

        writeAuditLog({
            transaction,
            actor: context,
            action: req.method === 'DELETE' ? 'maintenance.cancelled' : 'maintenance.updated',
            entity_type: 'maintenance_window',
            entity_id: windowId,
            metadata: update,
        })
    })

    return sendOk(res, updated)
})
