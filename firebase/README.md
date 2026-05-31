# Firebase Backend

Firebase is the database and identity layer for this app. Vercel remains the runtime for the trusted `/api/*` routes in the current architecture.

## Project

- Default Firebase project: `lab-dashboard-2809`
- Config files:
  - `.firebaserc`
  - `firebase.json`
  - `firebase/firestore.rules`
  - `firebase/firestore.indexes.json`

## Services Used

- Firebase Authentication with Email/Password sign-in.
- Cloud Firestore in Native mode.
- Firestore security rules and composite indexes.

Firebase Storage, Firebase Functions, Firebase Hosting, and Firebase App Hosting are not required by the current codebase.

## Collections

- `profiles/{uid}`: profile, role, status, and approval lifecycle.
- `machines/{machineId}`: lab machine catalog.
- `bookings/{bookingId}`: booking requests and review state.
- `booking_slots/{machineId}_{date}_{HHmm}`: one document per booked minute, used by server transactions to prevent overlaps.
- `booking_rules/{ruleId}`: reserved for future constraints.
- `audit_log/{logId}`: restricted audit records.

## Deploy Rules And Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes --project lab-dashboard-2809
```

Do not loosen rules to make a UI flow work. If a flow fails with permission denied, fix the server API, profile state, or data shape.

## First Admin

Set `BOOTSTRAP_ADMIN_EMAILS` in Vercel to one or more comma-separated verified admin emails. When one of those users signs in with a verified Firebase Auth account, the trusted API normalizes that profile to active admin.

For operator-facing steps to add students, faculty reviewers, and admins, see [`ACCESS_MANAGEMENT.md`](../ACCESS_MANAGEMENT.md).

## Migration

Dry-run first:

```bash
npm run migrate:hardening
```

Apply only after reading the dry-run report:

```bash
node scripts/migrate-production-hardening.js --apply
```

The migration normalizes profile status fields, preserves existing machines/bookings, and reports orphaned or invalid booking data.
