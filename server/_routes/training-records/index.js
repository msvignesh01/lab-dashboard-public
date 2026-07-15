import { adminDb } from '../../_lib/firebaseAdmin.js'
import { getAuthenticatedContext } from '../../_lib/authContext.js'
import { assertMethod, handleApi, parseJsonBody, sendOk, ApiError } from '../../_lib/http.js'
import { isValidFirestoreId } from '../../_lib/ids.js'
import { fromFirestoreDocument } from '../../_lib/firestoreData.js'
import { getTrainingRecordId } from '../../_lib/availability.js'
import { runAuditedTransaction } from '../../_lib/audit.js'
import { assertRateLimit } from '../../_lib/rateLimit.js'
import { createNotification } from '../../_lib/notifications.js'
import { assertValidTrainingTargets, parseTrainingStatus } from '../../_lib/trainingPolicy.js'

const nowIso = () => new Date().toISOString()

const resolveStudentId = async (body) => {
    const rawId = String(body?.student_id || '').trim()
    if (isValidFirestoreId(rawId)) return rawId

    const email = String(body?.student_email || '').trim().toLowerCase()
    if (!email) return ''

    const snapshot = await adminDb.collection('profiles').where('email', '==', email).limit(1).get()
    return snapshot.empty ? '' : snapshot.docs[0].id
}

const sanitizeTrainingPayload = (body, actorUid) => {
    const studentId = String(body.student_id || '').trim()
    const machineId = String(body.machine_id || '').trim()
    if (!isValidFirestoreId(studentId) || !isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Student and machine are required.', 'invalid_training_target')
    }

    const status = parseTrainingStatus(body.status)
    const timestamp = nowIso()
    return {
        id: getTrainingRecordId(studentId, machineId),
        student_id: studentId,
        machine_id: machineId,
        status,
        approved_by: status === 'active' ? actorUid : null,
        approved_at: status === 'active' ? timestamp : null,
        revoked_at: status === 'revoked' ? timestamp : null,
        notes: typeof body.notes === 'string' ? body.notes.trim().slice(0, 500) : '',
        updated_by: actorUid,
        created_at: timestamp,
        updated_at: timestamp,
    }
}

export default handleApi(async (req, res) => {
    assertMethod(req, ['GET', 'POST', 'PATCH'])

    const context = await getAuthenticatedContext(req, {
        requireVerified: true,
        requireActive: true,
    })

    const isReviewer = ['faculty', 'admin'].includes(context.profile.role)

    if (req.method === 'GET') {
        const studentId = String(req.query?.student_id || '').trim()
        const machineId = String(req.query?.machine_id || '').trim()

        if (!isReviewer && studentId && studentId !== context.uid) {
            throw new ApiError(403, 'You can only view your own training records.', 'permission_denied')
        }

        if (studentId && machineId) {
            const snap = await adminDb.collection('training_records').doc(getTrainingRecordId(studentId, machineId)).get()
            return sendOk(res, snap.exists ? fromFirestoreDocument(snap) : null)
        }

        let query = adminDb.collection('training_records')
        if (!isReviewer) query = query.where('student_id', '==', context.uid)
        if (isReviewer && studentId) query = query.where('student_id', '==', studentId)
        if (machineId) query = query.where('machine_id', '==', machineId)

        const snapshot = await query.limit(100).get()
        return sendOk(res, snapshot.docs.map(fromFirestoreDocument))
    }

    if (!isReviewer) {
        throw new ApiError(403, 'You do not have permission to manage training records.', 'permission_denied')
    }

    await assertRateLimit({ uid: context.uid, action: 'training_update', limit: 40, windowMs: 60_000 })
    const body = await parseJsonBody(req)
    const studentId = await resolveStudentId(body)
    if (!isValidFirestoreId(studentId)) {
        throw new ApiError(400, 'No registered student matches that email or UID.', 'student_not_found')
    }
    const machineId = String(body.machine_id || '').trim()
    if (!isValidFirestoreId(machineId)) {
        throw new ApiError(400, 'Student and machine are required.', 'invalid_training_target')
    }

    const studentProfileRef = adminDb.collection('profiles').doc(studentId)
    const machineRef = adminDb.collection('machines').doc(machineId)
    const recordId = getTrainingRecordId(studentId, machineId)
    const trainingRef = adminDb.collection('training_records').doc(recordId)

    const committed = await runAuditedTransaction({
        actor: context,
        mutate: async (transaction) => {
            const studentProfileSnap = await transaction.get(studentProfileRef)
            const machineSnap = await transaction.get(machineRef)
            const existing = await transaction.get(trainingRef)

            const studentProfile = studentProfileSnap.exists
                ? fromFirestoreDocument(studentProfileSnap)
                : null
            const machine = machineSnap.exists
                ? fromFirestoreDocument(machineSnap)
                : null
            assertValidTrainingTargets({ studentProfile, machine })

            const record = sanitizeTrainingPayload({
                ...body,
                student_id: studentId,
                machine_id: machineId,
            }, context.uid)
            const nextRecord = existing.exists
                ? { ...existing.data(), ...record, created_at: existing.data().created_at || record.created_at }
                : record

            transaction.set(trainingRef, nextRecord, { merge: true })
            return {
                result: {
                    record: nextRecord,
                    created: !existing.exists,
                    studentProfile,
                },
                audit: {
                    action: nextRecord.status === 'active' ? 'training.approved' : 'training.revoked',
                    entity_type: 'training_record',
                    entity_id: nextRecord.id,
                    metadata: {
                        student_id: nextRecord.student_id,
                        machine_id: nextRecord.machine_id,
                        status: nextRecord.status,
                    },
                },
            }
        },
    })

    if (committed.studentProfile) {
        await createNotification({
            profile: committed.studentProfile,
            type: committed.record.status === 'active' ? 'training_approved' : 'training_revoked',
            title: committed.record.status === 'active' ? 'Machine training approved' : 'Machine training revoked',
            message: committed.record.status === 'active'
                ? 'You are now approved to book this training-required machine.'
                : 'Your training approval for a machine has been revoked.',
            entity: { type: 'training_record', id: committed.record.id },
            email: true,
        }).catch(() => {})
    }

    return sendOk(res, committed.record, committed.created ? 201 : 200)
})
