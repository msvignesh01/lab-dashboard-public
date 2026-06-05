import fs from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
} from 'firebase/firestore'

const projectId = 'lab-dashboard-rules-test'
const now = '2026-06-05T00:00:00.000Z'

let testEnv

const profile = (overrides = {}) => ({
    id: overrides.id || 'student-1',
    email: overrides.email || 'student.one@btech.christuniversity.in',
    full_name: overrides.full_name || 'Student One',
    role: overrides.role || 'student',
    requested_role: overrides.requested_role || overrides.role || 'student',
    status: overrides.status || 'active',
    department: overrides.department || 'ELCS',
    created_at: now,
    updated_at: now,
    ...overrides,
})

const authedDb = (uid, email, emailVerified = true) => testEnv.authenticatedContext(uid, {
    email,
    email_verified: emailVerified,
}).firestore()

const seedBaseData = async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()

        await setDoc(doc(db, 'profiles/student-1'), profile())
        await setDoc(doc(db, 'profiles/student-2'), profile({
            id: 'student-2',
            email: 'student.two@btech.christuniversity.in',
            full_name: 'Student Two',
        }))
        await setDoc(doc(db, 'profiles/faculty-1'), profile({
            id: 'faculty-1',
            email: 'faculty.one@christuniversity.in',
            full_name: 'Faculty One',
            role: 'faculty',
        }))
        await setDoc(doc(db, 'profiles/admin-1'), profile({
            id: 'admin-1',
            email: 'admin.one@christuniversity.in',
            full_name: 'Admin One',
            role: 'admin',
        }))
        await setDoc(doc(db, 'profiles/pending-faculty'), profile({
            id: 'pending-faculty',
            email: 'pending.one@christuniversity.in',
            full_name: 'Pending Faculty',
            role: 'faculty',
            requested_role: 'faculty',
            status: 'pending_approval',
        }))

        await setDoc(doc(db, 'machines/active-machine'), {
            name: 'Active Machine',
            is_active: true,
            department: 'ELCS',
        })
        await setDoc(doc(db, 'machines/inactive-machine'), {
            name: 'Inactive Machine',
            is_active: false,
            department: 'ELCS',
        })
        await setDoc(doc(db, 'bookings/booking-1'), {
            student_id: 'student-1',
            machine_id: 'active-machine',
            status: 'pending',
            booking_date: '2026-06-06',
        })
        await setDoc(doc(db, 'booking_slots/slot-1'), {
            booking_id: 'booking-1',
            machine_id: 'active-machine',
        })
        await setDoc(doc(db, 'training_records/student-1_active-machine'), {
            student_id: 'student-1',
            machine_id: 'active-machine',
            status: 'active',
        })
        await setDoc(doc(db, 'training_records/student-2_active-machine'), {
            student_id: 'student-2',
            machine_id: 'active-machine',
            status: 'active',
        })
        await setDoc(doc(db, 'notifications/n1'), {
            user_id: 'student-1',
            title: 'Booking submitted',
            created_at: now,
        })
        await setDoc(doc(db, 'notifications/n2'), {
            user_id: 'student-2',
            title: 'Booking submitted',
            created_at: now,
        })
        await setDoc(doc(db, 'maintenance_windows/mw-1'), {
            machine_id: 'active-machine',
            status: 'active',
            start_at: '2026-06-06T04:00:00.000Z',
            end_at: '2026-06-06T05:00:00.000Z',
        })
        await setDoc(doc(db, 'lab_config/default'), {
            timezone: 'Asia/Kolkata',
            open_time: '09:00',
            close_time: '18:00',
        })
        await setDoc(doc(db, 'audit_log/a1'), {
            actor_id: 'faculty-1',
            action: 'booking.review',
            created_at: now,
        })
    })
}

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
    await seedBaseData()
})

afterAll(async () => {
    await testEnv.cleanup()
})

describe('Firestore production rules', () => {
    it('blocks unverified and pending users from protected app data', async () => {
        const unverified = authedDb('student-1', 'student.one@btech.christuniversity.in', false)
        const pending = authedDb('pending-faculty', 'pending.one@christuniversity.in')

        await assertFails(getDoc(doc(unverified, 'machines/active-machine')))
        await assertFails(getDoc(doc(pending, 'machines/active-machine')))
    })

    it('allows active students to read active machines and their own records only', async () => {
        const db = authedDb('student-1', 'student.one@btech.christuniversity.in')

        await assertSucceeds(getDoc(doc(db, 'machines/active-machine')))
        await assertFails(getDoc(doc(db, 'machines/inactive-machine')))
        await assertSucceeds(getDoc(doc(db, 'bookings/booking-1')))
        await assertSucceeds(getDoc(doc(db, 'training_records/student-1_active-machine')))
        await assertFails(getDoc(doc(db, 'training_records/student-2_active-machine')))
        await assertSucceeds(getDoc(doc(db, 'notifications/n1')))
        await assertFails(getDoc(doc(db, 'notifications/n2')))
    })

    it('denies all direct student writes to critical operational collections', async () => {
        const db = authedDb('student-1', 'student.one@btech.christuniversity.in')

        await assertFails(setDoc(doc(db, 'bookings/new-booking'), { student_id: 'student-1' }))
        await assertFails(updateDoc(doc(db, 'bookings/booking-1'), { status: 'cancelled' }))
        await assertFails(setDoc(doc(db, 'booking_slots/new-slot'), { booking_id: 'new-booking' }))
        await assertFails(setDoc(doc(db, 'machines/new-machine'), { name: 'New Machine' }))
        await assertFails(setDoc(doc(db, 'training_records/student-1_new-machine'), { status: 'active' }))
        await assertFails(setDoc(doc(db, 'maintenance_windows/new-window'), { status: 'active' }))
        await assertFails(setDoc(doc(db, 'lab_config/default'), { open_time: '08:00' }))
        await assertFails(setDoc(doc(db, 'audit_log/new-log'), { action: 'fake' }))
    })

    it('allows faculty and admins to read operational records without client writes', async () => {
        const facultyDb = authedDb('faculty-1', 'faculty.one@christuniversity.in')
        const adminDb = authedDb('admin-1', 'admin.one@christuniversity.in')

        await assertSucceeds(getDocs(collection(facultyDb, 'profiles')))
        await assertSucceeds(getDoc(doc(facultyDb, 'machines/inactive-machine')))
        await assertSucceeds(getDoc(doc(facultyDb, 'booking_slots/slot-1')))
        await assertSucceeds(getDocs(collection(facultyDb, 'audit_log')))
        await assertFails(updateDoc(doc(facultyDb, 'bookings/booking-1'), { status: 'approved' }))

        await assertSucceeds(getDocs(collection(adminDb, 'profiles')))
        await assertFails(updateDoc(doc(adminDb, 'profiles/faculty-1'), { role: 'admin' }))
    })

    it('prevents students from self-creating privileged profiles', async () => {
        const db = authedDb('new-student', 'new.student@btech.christuniversity.in')

        await assertFails(setDoc(doc(db, 'profiles/new-student'), profile({
            id: 'new-student',
            email: 'new.student@btech.christuniversity.in',
            role: 'admin',
            requested_role: 'admin',
            status: 'active',
        })))
    })
})
