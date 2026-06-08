# Lab Dashboard Production QA Checklist

Use this before and after each production deployment.

## 1. Build And Quality Gates

```bash
npm ci
npm run lint
npm test
npm run test:rules
npm run build
npm run vercel-build
npm audit --omit=dev
```

Expected: all commands pass with no high or critical production vulnerabilities.

Note: `npm run test:rules` requires Java because it starts the Firestore emulator.

## 2. Firebase Setup

1. Confirm Firebase project is `lab-dashboard-2809` for production or `aml-lab-dash-test-2809` for branch preview testing.
2. Confirm Email/Password sign-in is enabled.
3. Confirm Firestore Native mode database exists.
4. Deploy Firestore rules and indexes:

```bash
firebase deploy --only firestore:rules,firestore:indexes --project production
```

Expected: rules and indexes deploy without weakening security.

## 3. Vercel Setup

1. Confirm Vercel project is linked to this GitHub repo.
2. Confirm build command is `npm run vercel-build`.
3. Confirm output directory is `dist`.
4. Confirm production and preview env vars include:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `FIREBASE_ADMIN_PROJECT_ID`
   - `FIREBASE_ADMIN_CLIENT_EMAIL`
   - `FIREBASE_ADMIN_PRIVATE_KEY`
   - `BOOTSTRAP_ADMIN_EMAILS`

Expected: deployed app does not show the missing-config unavailable screen, and `/api/profile/me` returns structured auth errors when unauthenticated.

## 4. Auth And Role Lifecycle

1. Sign up a student with a `@btech.christuniversity.in` email.
2. Verify the student email.
3. Sign up a faculty user with a `@christuniversity.in` email.
4. Verify the faculty email.
5. Sign in once as the faculty user after verification so the backend records `email_verified_at`.
6. Sign in as bootstrap admin and approve the faculty request from **Admin Console > Faculty Access**.

Expected:

- Unverified users see the verify-email gate.
- Faculty users remain pending until approved, and unverified faculty requests cannot be approved.
- Students cannot access faculty/admin screens.
- Bootstrap admin is active only for configured emails.
- Operator instructions match [`ACCESS_MANAGEMENT.md`](./ACCESS_MANAGEMENT.md).

## 5. Booking Flow

1. Create a valid future booking as a student.
2. Try an overlapping booking for the same machine/time.
3. Approve the booking as faculty/admin.
4. Cancel an eligible future booking as the owning student.
5. Try reviewing or cancelling a stale past booking.
6. Try booking outside configured lab hours.
7. Try booking during an active maintenance window.
8. Try booking a training-required machine without training approval.

Expected:

- Valid bookings create `bookings` and `booking_slots`.
- Overlaps are rejected.
- Approval preserves slot locks.
- Rejection/cancellation releases slot locks.
- Past/stale mutations are rejected.
- Lab hours, maintenance windows, and training approvals are enforced by the server.

## 6. Machine Management

1. Create a machine as faculty/admin.
2. Update name, description, department, active state, training requirement, and specifications.
3. Delete a machine with no bookings.
4. Delete a machine with historical bookings.

Expected:

- Students cannot call machine-management APIs.
- Machines with historical bookings are deactivated rather than hard-deleted.
- HTTPS image URL validation is enforced.
- Mobile faculty/admin users can reach **Operations > Machines** and see **Add Machine**.

## 7. Operations, Users, And Notifications

1. Create and cancel a maintenance window.
2. Approve and revoke a training record.
3. As admin, suspend/reactivate a non-admin test user.
4. As admin, change a test user's role.
5. Confirm notifications appear after booking decisions and access changes.
6. Confirm audit entries appear for booking, machine, maintenance, training, user, and config changes.

Expected:

- Students cannot manage users, maintenance, training, machines, or lab config.
- Email notification failures do not break the core transaction.
- No privileged email addresses are present in docs, source, or logs.

## 8. UI Reliability

1. Load Dashboard, Machines, Bookings, Admin, and Faculty Dashboard.
2. Test empty, loading, error, unauthorized, and success states.
3. Test mobile navigation with keyboard focus and Escape close.
4. Test confirmation dialogs and password reveal buttons with keyboard.

Expected: no crashes, no broken focus traps, and no action buttons that silently fail.

## 9. Audit Sync

1. Send `/api/internal/sync` with wrong secret.
2. Send malformed JSON with correct secret.
3. Send valid profile insert payload with spreadsheet-formula-like values.

Expected:

- Wrong secret is rejected.
- Malformed payload is rejected.
- Valid rows are escaped and appended only when audit env vars are configured.

## 10. Production Sign-Off

Record:

- Deployment URL:
- Git commit:
- Firebase project:
- Firestore rules/indexes deployed:
- Migration dry-run reviewed:
- Migration apply approved:
- Tester:
- Date:
- Known issues:
