import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
    assertFails,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
} from 'firebase/firestore'

const projectId = 'lab-dashboard-rules-test'

let testEnv

const authedDb = (uid, email, emailVerified = true) => testEnv.authenticatedContext(uid, {
    email,
    email_verified: emailVerified,
}).firestore()

beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
        projectId,
        firestore: {
            rules: fs.readFileSync('firebase/firestore.rules', 'utf8'),
        },
    })
})

beforeEach(async () => {
    await testEnv.clearFirestore()
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await Promise.all([
            setDoc(doc(db, 'profiles/student-1'), {
                id: 'student-1',
                email: 'student.one@btech.christuniversity.in',
                role: 'student',
                status: 'active',
            }),
            setDoc(doc(db, 'machines/machine-1'), { name: 'Printer', is_active: true }),
            setDoc(doc(db, 'bookings/booking-1'), { student_id: 'student-1', status: 'pending' }),
            setDoc(doc(db, 'booking_slots/slot-1'), { booking_id: 'booking-1' }),
            setDoc(doc(db, 'schedule_guards/machine-1_2026-07-15'), { version: 1 }),
            setDoc(doc(db, 'training_records/student-1_machine-1'), { student_id: 'student-1' }),
            setDoc(doc(db, 'notifications/notice-1'), { user_id: 'student-1' }),
            setDoc(doc(db, 'maintenance_windows/window-1'), { machine_id: 'machine-1' }),
            setDoc(doc(db, 'lab_config/default'), { timezone: 'Asia/Kolkata' }),
            setDoc(doc(db, 'audit_log/audit-1'), { action: 'booking.created' }),
            setDoc(doc(db, 'rate_limits/student-1_booking'), { count: 1 }),
            setDoc(doc(db, 'unrecognized/private-record'), { secret: true }),
        ])
    })
})

afterAll(async () => {
    await testEnv.cleanup()
})

describe('server-only Firestore rules', () => {
    it('denies anonymous and authenticated browser reads from every application collection', async () => {
        const anonymousDb = testEnv.unauthenticatedContext().firestore()
        const studentDb = authedDb('student-1', 'student.one@btech.christuniversity.in')
        const facultyDb = authedDb('faculty-1', 'faculty.one@christuniversity.in')
        const adminDb = authedDb('admin-1', 'admin.one@christuniversity.in')

        await assertFails(getDoc(doc(anonymousDb, 'machines/machine-1')))
        await assertFails(getDoc(doc(studentDb, 'profiles/student-1')))
        await assertFails(getDocs(collection(studentDb, 'machines')))
        await assertFails(getDoc(doc(studentDb, 'bookings/booking-1')))
        await assertFails(getDocs(collection(studentDb, 'training_records')))
        await assertFails(getDocs(collection(studentDb, 'notifications')))
        await assertFails(getDocs(collection(studentDb, 'maintenance_windows')))
        await assertFails(getDoc(doc(studentDb, 'lab_config/default')))
        await assertFails(getDocs(collection(facultyDb, 'booking_slots')))
        await assertFails(getDocs(collection(facultyDb, 'schedule_guards')))
        await assertFails(getDocs(collection(facultyDb, 'audit_log')))
        await assertFails(getDocs(collection(adminDb, 'rate_limits')))
        await assertFails(getDocs(collection(adminDb, 'profiles')))
        await assertFails(getDoc(doc(adminDb, 'unrecognized/private-record')))
    })

    it('denies all browser writes regardless of token role or verification state', async () => {
        const studentDb = authedDb('student-1', 'student.one@btech.christuniversity.in')
        const unverifiedDb = authedDb('student-1', 'student.one@btech.christuniversity.in', false)
        const adminDb = authedDb('admin-1', 'admin.one@christuniversity.in')

        await assertFails(setDoc(doc(studentDb, 'bookings/new-booking'), { status: 'pending' }))
        await assertFails(updateDoc(doc(studentDb, 'profiles/student-1'), { full_name: 'Changed' }))
        await assertFails(deleteDoc(doc(studentDb, 'notifications/notice-1')))
        await assertFails(setDoc(doc(unverifiedDb, 'profiles/new-profile'), { role: 'student' }))
        await assertFails(updateDoc(doc(adminDb, 'machines/machine-1'), { is_active: false }))
        await assertFails(setDoc(doc(adminDb, 'audit_log/fake'), { action: 'fake' }))
    })
})
