// Comprehensive end-to-end suite against the running dev-api (start `npm run dev:api`).
// Mints ID tokens via the Admin SDK (no passwords) and exercises every endpoint and the
// core business rules for student / faculty / admin, then cleans up all test data.
//   npm run e2e:smoke
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const API = process.env.E2E_API_BASE || 'http://127.0.0.1:3001'
const API_KEY = process.env.VITE_FIREBASE_API_KEY

const normalizePrivateKey = (key) => String(key || '').replace(/\\n/g, '\n')
const required = (name, fallback) => {
    const value = process.env[name] || (fallback ? process.env[fallback] : '')
    if (!value) throw new Error(`Missing required environment variable: ${name}`)
    return value
}
const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID
const app = initializeApp({
    credential: cert({
        projectId,
        clientEmail: required('FIREBASE_ADMIN_CLIENT_EMAIL', 'GCP_CLIENT_EMAIL'),
        privateKey: normalizePrivateKey(required('FIREBASE_ADMIN_PRIVATE_KEY', 'GCP_PRIVATE_KEY')),
    }),
    projectId,
})
const auth = getAuth(app)
const db = getFirestore(app)

const idTokenForUid = async (uid) => {
    const customToken = await auth.createCustomToken(uid)
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    })
    const json = await res.json()
    if (!json.idToken) throw new Error(`token exchange failed for ${uid}: ${JSON.stringify(json)}`)
    return json.idToken
}
const idTokenForEmail = async (email) => idTokenForUid((await auth.getUserByEmail(email)).uid)

const call = async (token, path, { method = 'GET', body } = {}) => {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
}

let passed = 0
let failed = 0
const fails = []
const check = (name, ok, detail) => {
    if (ok) { passed++; process.stdout.write(`  PASS  ${name}\n`) }
    else { failed++; fails.push(name); process.stdout.write(`  FAIL  ${name} :: ${JSON.stringify(detail)}\n`) }
}
const section = (name) => process.stdout.write(`\n# ${name}\n`)

const labDateAtLeast = (minDaysAhead) => {
    for (let i = minDaysAhead; i <= minDaysAhead + 8; i += 1) {
        const ms = Date.now() + i * 86400000 + 330 * 60000
        const weekday = new Date(ms).getUTCDay()
        if (weekday >= 1 && weekday <= 6) return new Date(ms).toISOString().slice(0, 10)
    }
    return new Date(Date.now() + 86400000).toISOString().slice(0, 10)
}

const STUDENT = process.env.E2E_STUDENT_EMAIL || 'e2e-student@btech.christuniversity.in'
const FACULTY = process.env.E2E_FACULTY_EMAIL || 'e2e-faculty@christuniversity.in'
const ADMIN = process.env.E2E_ADMIN_EMAIL || 'e2e-admin@christuniversity.in'
const REAL_ADMINS = (process.env.E2E_ADMIN_EMAILS || 'ms.rishav@btech.christuniversity.in,john.silvister@christuniversity.in')
    .split(',').map((s) => s.trim()).filter(Boolean)

const ts = Date.now()
const created = { machines: [], bookings: [], maintenance: [], training: [], users: [], profiles: [] }

const makeTempUser = async (suffix, profile) => {
    const email = `e2e-${suffix}-${ts}@christuniversity.in`
    const user = await auth.createUser({ email, password: 'E2eTemp!2026', emailVerified: true })
    const now = new Date().toISOString()
    await db.collection('profiles').doc(user.uid).set({
        id: user.uid, email, full_name: `E2E ${suffix}`, department: 'CSE',
        phone: '', register_number: '', specialization: '', year_of_passout: '',
        approved_by: null, approved_at: null, suspended_at: null, email_verified_at: now,
        created_at: now, updated_at: now, ...profile,
    })
    created.users.push(user.uid)
    return { uid: user.uid, email }
}

const main = async () => {
    const studentT = await idTokenForEmail(STUDENT)
    const facultyT = await idTokenForEmail(FACULTY)
    const adminT = await idTokenForEmail(ADMIN)
    const studentUid = (await auth.getUserByEmail(STUDENT)).uid
    const adminUid = (await auth.getUserByEmail(ADMIN)).uid

    const date1 = labDateAtLeast(1)
    const date2 = labDateAtLeast(8)

    section('Auth & profile')
    check('no token -> 401', (await call(null, '/api/profile/me')).status === 401)
    const me = await call(studentT, '/api/profile/me')
    check('student reads own profile (role=student)', me.status === 200 && me.json?.data?.role === 'student', me)
    check('student blocked from /api/users (403)', (await call(studentT, '/api/users')).status === 403)
    for (const email of REAL_ADMINS) {
        try {
            const t = await idTokenForEmail(email)
            const r = await call(t, '/api/users')
            check(`real admin ${email} can list users (200)`, r.status === 200 && Array.isArray(r.json?.data), { status: r.status })
        } catch (err) { check(`real admin ${email} token`, false, err.message) }
    }

    section('Lab config')
    const cfg = await call(adminT, '/api/lab-config')
    check('admin reads lab-config', cfg.status === 200 && Boolean(cfg.json?.data?.open_time), cfg)
    check('student cannot PATCH lab-config (403)', (await call(studentT, '/api/lab-config', { method: 'PATCH', body: { max_advance_days: 30 } })).status === 403)
    check('admin updates lab-config (200)', (await call(adminT, '/api/lab-config', { method: 'PATCH', body: { open_time: cfg.json?.data?.open_time?.slice(0, 5), close_time: cfg.json?.data?.close_time?.slice(0, 5), active_weekdays: cfg.json?.data?.active_weekdays, max_advance_days: cfg.json?.data?.max_advance_days, max_duration_hours: cfg.json?.data?.max_duration_hours } })).status === 200)

    section('Machines')
    check('student cannot create machine (403)', (await call(studentT, '/api/machines', { method: 'POST', body: { name: 'x' } })).status === 403)
    check('admin create with no name -> 400', (await call(adminT, '/api/machines', { method: 'POST', body: { department: 'CSE' } })).status === 400)
    const facMachine = await call(facultyT, '/api/machines', { method: 'POST', body: { name: `E2E Faculty M ${ts}`, department: 'ECE', is_active: true } })
    check('faculty creates machine (201)', facMachine.status === 201, facMachine)
    if (facMachine.json?.data?.id) created.machines.push(facMachine.json.data.id)
    const normalM = await call(adminT, '/api/machines', { method: 'POST', body: { name: `E2E Normal ${ts}`, department: 'CSE', location: 'Lab A', is_active: true, requires_training: false } })
    check('admin creates normal machine (201)', normalM.status === 201, normalM)
    const normalId = normalM.json?.data?.id
    if (normalId) created.machines.push(normalId)
    const trainM = await call(adminT, '/api/machines', { method: 'POST', body: { name: `E2E Train ${ts}`, department: 'CSE', is_active: true, requires_training: true } })
    check('admin creates training-required machine (201)', trainM.status === 201, trainM)
    const trainId = trainM.json?.data?.id
    if (trainId) created.machines.push(trainId)
    check('admin updates machine (200)', (await call(adminT, `/api/machines/${normalId}`, { method: 'PATCH', body: { location: 'Lab B' } })).status === 200)
    const avail = await call(studentT, `/api/machines/${normalId}/availability?date=${date1}`)
    check('student reads availability (open intervals)', avail.status === 200 && Array.isArray(avail.json?.data?.available_intervals) && avail.json.data.available_intervals.length > 0, { status: avail.status })

    section('Training gate')
    check('student cannot read others training (403)', (await call(studentT, `/api/training-records?student_id=someone-else`)).status === 403)
    const blocked = await call(studentT, '/api/bookings', { method: 'POST', body: { machine_id: trainId, booking_date: date1, start_time: '10:00:00', end_time: '11:00:00', purpose: 'should be blocked' } })
    check('untrained student blocked from training machine (403)', blocked.status === 403 && blocked.json?.error?.code === 'training_required', blocked)
    const grant = await call(adminT, '/api/training-records', { method: 'POST', body: { student_email: STUDENT, machine_id: trainId, status: 'active', notes: 'e2e' } })
    check('admin grants training by EMAIL (resolves to uid)', (grant.status === 200 || grant.status === 201) && grant.json?.data?.student_id === studentUid, grant)
    if (grant.json?.data?.id) created.training.push(grant.json.data.id)
    const trained = await call(studentT, '/api/bookings', { method: 'POST', body: { machine_id: trainId, booking_date: date1, start_time: '10:00:00', end_time: '11:00:00', purpose: 'trained booking' } })
    check('trained student books training machine (201)', trained.status === 201, trained)
    if (trained.json?.data?.id) created.bookings.push(trained.json.data.id)

    section('Booking lifecycle + overlap')
    const b1 = await call(studentT, '/api/bookings', { method: 'POST', body: { machine_id: normalId, booking_date: date1, start_time: '14:00:00', end_time: '15:00:00', purpose: 'lifecycle' } })
    check('student creates booking (201)', b1.status === 201, b1)
    const b1Id = b1.json?.data?.id
    if (b1Id) created.bookings.push(b1Id)
    check('overlapping booking rejected (409)', (await call(studentT, '/api/bookings', { method: 'POST', body: { machine_id: normalId, booking_date: date1, start_time: '14:30:00', end_time: '15:30:00', purpose: 'overlap' } })).status === 409)
    check('faculty cannot create booking (403)', (await call(facultyT, '/api/bookings', { method: 'POST', body: { machine_id: normalId, booking_date: date1, start_time: '16:00:00', end_time: '17:00:00', purpose: 'x' } })).status === 403)
    check('reject without reason -> 400', (await call(facultyT, `/api/bookings/${b1Id}/review`, { method: 'PATCH', body: { status: 'rejected' } })).status === 400)
    check('faculty approves booking (200)', (await call(facultyT, `/api/bookings/${b1Id}/review`, { method: 'PATCH', body: { status: 'approved' } })).json?.data?.status === 'approved')
    const avail2 = await call(studentT, `/api/machines/${normalId}/availability?date=${date1}`)
    check('availability reflects the approved booking', avail2.json?.data?.booking_intervals?.some((i) => i.start_time?.startsWith('14:')), { intervals: avail2.json?.data?.booking_intervals })
    check('student cancels own booking (200)', (await call(studentT, `/api/bookings/${b1Id}/cancel`, { method: 'PATCH' })).status === 200)

    section('Maintenance gate')
    const maint = await call(adminT, '/api/maintenance-windows', { method: 'POST', body: { scope: 'machine', machine_id: normalId, start_date: date2, start_time: '09:00', end_date: date2, end_time: '18:00', reason: 'E2E maintenance' } })
    check('admin schedules maintenance (201)', maint.status === 201, maint)
    const maintId = maint.json?.data?.id
    if (maintId) created.maintenance.push(maintId)
    check('maintenance-windows list includes it', (await call(adminT, '/api/maintenance-windows')).json?.data?.some((w) => w.id === maintId))
    check('booking during maintenance rejected (409)', (await call(studentT, '/api/bookings', { method: 'POST', body: { machine_id: normalId, booking_date: date2, start_time: '11:00:00', end_time: '12:00:00', purpose: 'during maintenance' } })).status === 409)
    check('admin cancels maintenance (200)', (await call(adminT, `/api/maintenance-windows/${maintId}`, { method: 'DELETE' })).status === 200)

    section('Notifications')
    const notifs = await call(studentT, '/api/notifications')
    check('student lists notifications (200)', notifs.status === 200 && Array.isArray(notifs.json?.data), notifs)
    const unreadIds = (notifs.json?.data || []).filter((n) => !n.read_at).map((n) => n.id).slice(0, 25)
    if (unreadIds.length) {
        check('student marks notifications read (200)', (await call(studentT, '/api/notifications', { method: 'PATCH', body: { ids: unreadIds } })).status === 200)
    } else {
        check('student marks notifications read (no unread to mark)', true)
    }

    section('Faculty access requests')
    const pf1 = await makeTempUser('pf1', { role: 'faculty', requested_role: 'faculty', status: 'pending_approval' })
    const pf2 = await makeTempUser('pf2', { role: 'faculty', requested_role: 'faculty', status: 'pending_approval' })
    check('admin lists faculty requests (includes pending)', (await call(adminT, '/api/profile/faculty-requests')).json?.data?.some((p) => p.id === pf1.uid))
    check('student cannot list faculty requests (403)', (await call(studentT, '/api/profile/faculty-requests')).status === 403)
    check('admin approves faculty request (200, role=faculty)', (await call(adminT, `/api/profile/${pf1.uid}/approve`, { method: 'PATCH' })).json?.data?.role === 'faculty')
    check('admin rejects faculty request (200, suspended)', (await call(adminT, `/api/profile/${pf2.uid}/reject`, { method: 'PATCH', body: { reason: 'e2e reject' } })).json?.data?.status === 'suspended')

    section('User management')
    const temp = await makeTempUser('user', { role: 'student', status: 'active' })
    check('admin changes user role (200)', (await call(adminT, `/api/users/${temp.uid}/role`, { method: 'PATCH', body: { role: 'faculty' } })).json?.data?.role === 'faculty')
    check('admin suspends user (200)', (await call(adminT, `/api/users/${temp.uid}/status`, { method: 'PATCH', body: { status: 'suspended' } })).json?.data?.status === 'suspended')
    check('admin reactivates user (200)', (await call(adminT, `/api/users/${temp.uid}/status`, { method: 'PATCH', body: { status: 'active' } })).status === 200)
    check('admin cannot change own role (409)', (await call(adminT, `/api/users/${adminUid}/role`, { method: 'PATCH', body: { role: 'student' } })).status === 409)
    check('student cannot change roles (403)', (await call(studentT, `/api/users/${temp.uid}/role`, { method: 'PATCH', body: { role: 'admin' } })).status === 403)

    section('Audit log & method validation')
    check('admin reads audit log (non-empty)', (await call(adminT, '/api/audit-log')).json?.data?.length > 0)
    check('faculty reads audit log (200)', (await call(facultyT, '/api/audit-log')).status === 200)
    check('student cannot read audit log (403)', (await call(studentT, '/api/audit-log')).status === 403)
    check('wrong method -> 405', (await call(studentT, '/api/bookings', { method: 'DELETE' })).status === 405)
    check('unknown route -> 404', (await call(studentT, '/api/does-not-exist')).status === 404)
}

const cleanup = async () => {
    section('Cleanup')
    for (const id of created.bookings) {
        const slots = await db.collection('booking_slots').where('booking_id', '==', id).get().catch(() => ({ docs: [] }))
        await Promise.all(slots.docs.map((d) => d.ref.delete().catch(() => {})))
        await db.collection('bookings').doc(id).delete().catch(() => {})
    }
    for (const id of created.machines) await db.collection('machines').doc(id).delete().catch(() => {})
    for (const id of created.maintenance) await db.collection('maintenance_windows').doc(id).delete().catch(() => {})
    for (const id of created.training) await db.collection('training_records').doc(id).delete().catch(() => {})
    for (const uid of created.users) {
        await db.collection('profiles').doc(uid).delete().catch(() => {})
        await auth.deleteUser(uid).catch(() => {})
    }
    // Best-effort: clear notifications generated for the seeded test users during the run.
    for (const email of [STUDENT, FACULTY, ADMIN]) {
        try {
            const u = await auth.getUserByEmail(email)
            const ns = await db.collection('notifications').where('user_id', '==', u.uid).get()
            await Promise.all(ns.docs.map((d) => d.ref.delete().catch(() => {})))
        } catch { /* ignore */ }
    }
    process.stdout.write('  cleanup complete\n')
}

main()
    .catch((err) => { process.stdout.write(`\nFATAL: ${err?.stack || err}\n`); failed++ })
    .finally(async () => {
        await cleanup().catch((err) => process.stdout.write(`cleanup error: ${err?.message}\n`))
        process.stdout.write(`\n${passed} passed, ${failed} failed${fails.length ? ` -> ${fails.join('; ')}` : ''}\n`)
        process.exit(failed ? 1 : 0)
    })
