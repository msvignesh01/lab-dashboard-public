import crypto from 'node:crypto'
import { adminDb } from '../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../_lib/http.js'
import { isValidFirestoreId } from '../_lib/ids.js'
import { parseDateOnlyParts } from '../_lib/bookingPolicy.js'
import { LAB_TIMEZONE_OFFSET_MINUTES } from '../_lib/labConfig.js'
import { parseTimeToMinute } from '../../src/lib/bookingValidation.js'
import { writeAuditLog } from '../_lib/audit.js'
import { assertRateLimit } from '../_lib/rateLimit.js'
import { notifyFacultyAndAdmins } from '../_lib/notifications.js'

const nowIso = () => new Date().toISOString()

const toIso = (date, time) => {
    const parts = parseDateOnlyParts(date)
    const minute = parseTimeToMinute(time)
    if (!parts || !Number.isFinite(minute)) return null
    const ms = Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(minute / 60), minute % 60)
        - LAB_TIMEZONE_OFFSET_MINUTES * 60 * 1000
    return new Date(ms).toISOString()
}

const sanitizeMaintenancePayload = (body, actorUid) => {
    if (!body || typeof body !== 'object') {
        throw new ApiError(400, 'Invalid maintenance window.', 'invalid_maintenance')
    }

    const scope = body.scope === 'global' ? 'global' : 'machine'
    const machineId = scope === 'machine' ? String(body.machine_id || '').trim() : ''
    if (scope === 'machine' && !isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Machine is required for machine maintenance.', 'invalid_machine_id')
    }

    const startAt = toIso(body.start_date, body.start_time)
    const endAt = toIso(body.end_date || body.start_date, body.end_time)
    if (!startAt || !endAt || new Date(startAt) >= new Date(endAt)) {
        throw new ApiError(400, 'Maintenance start and end times are invalid.', 'invalid_maintenance_window')
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 300) : ''
    if (!reason) {
        throw new ApiError(400, 'Maintenance reason is required.', 'missing_reason')
    }

    const timestamp = nowIso()
    return {
        scope,
        machine_id: scope === 'machine' ? machineId : null,
        start_at: startAt,
        end_at: endAt,
        reason,
        status: 'active',
        created_by: actorUid,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'POST'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
        roles: ['faculty', 'admin'],
    })

    if (req.method === 'GET') {
        const snapshot = await adminDb.collection('maintenance_windows').orderBy('start_at', 'desc').limit(100).get()
        return sendOk(res, snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    }

    await assertRateLimit({ uid: context.uid, action: 'maintenance_create', limit: 30, windowMs: 60_000 })
    const body = await parseJsonBody(req)
    const id = crypto.randomUUID()
    const record = {
        id,
        ...sanitizeMaintenancePayload(body, context.uid),
    }

    if (record.scope === 'machine') {
        const machineSnap = await adminDb.collection('machines').doc(record.machine_id).get()
        if (!machineSnap.exists) {
            throw new ApiError(404, 'Machine not found.', 'machine_not_found')
        }
    }

    await adminDb.collection('maintenance_windows').doc(id).create(record)
    await writeAuditLog({
        actor: context,
        action: 'maintenance.created',
        entity_type: 'maintenance_window',
        entity_id: id,
        metadata: record,
    })
    await notifyFacultyAndAdmins({
        type: 'maintenance_created',
        title: 'Maintenance window scheduled',
        message: `Maintenance has been scheduled: ${record.reason}`,
        entity: { type: 'maintenance_window', id },
    }).catch(() => {})

    return sendOk(res, record, 201)
})
