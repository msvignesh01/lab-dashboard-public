# Lab Dashboard

A production-oriented university lab equipment booking system for the Additive Manufacturing Lab. Students request machine time, faculty review requests, and admins manage machine inventory and faculty access.

## Current Production Architecture

- React 19 + Vite frontend.
- Vercel hosts the web app and a single catch-all serverless `/api/*` gateway.
- Firebase Authentication is the identity provider.
- Cloud Firestore stores profiles, machines, bookings, slot locks, and audit records.
- Firebase Admin SDK runs only in trusted server-side handlers imported by the API gateway.
- Firestore client SDK is used for safe reads and realtime subscriptions.

Do not deploy this app as Firebase Hosting-only unless the `/api/*` backend is also moved to Firebase Functions or another backend. The current app expects Vercel-compatible serverless API routes.

## Core Flows

- Students sign up with a verified `@btech.christuniversity.in` email, browse active machines, request future booking slots, track status, and cancel eligible future bookings.
- Faculty users sign up with a verified `@christuniversity.in` email and remain pending until an admin approves them.
- Faculty/admin users review pending booking requests through trusted API transactions.
- Admin users manage machines and approve faculty access.
- Booking conflicts are blocked by deterministic per-minute `booking_slots` created in Firestore transactions.

## Access Operations

Use [ACCESS_MANAGEMENT.md](./ACCESS_MANAGEMENT.md) for user-facing/operator instructions on adding students, approving faculty, bootstrapping the first admin, adding later admins, suspending users, and managing machine access.

## Project Structure

```text
api/                 Vercel API gateway entrypoint
server/              Private API handlers, policies, validation, and Firebase Admin code
firebase/            Firestore rules and indexes
scripts/             Admin utilities (migration, admin grant, user inspection) and the local end-to-end test harness
src/                 React application source
.firebaserc          Firebase project aliases
firebase.json        Firestore deploy config
vercel.json          Vercel routing and security headers
```

## Required Services

Firebase:

- Authentication: Email/Password provider.
- Firestore: Native mode database.
- Firestore rules and indexes from this repo.

Vercel:

- Static frontend hosting.
- A serverless `/api/*` gateway for bookings, machines, profiles, users, notifications, audit, training, maintenance, and internal sync.

Not currently required:

- Firebase Storage.
- Firebase Functions.
- Firebase App Hosting.
- Firebase Hosting, unless intentionally migrating away from Vercel.

## Environment Variables

Create `.env` locally and configure the same values in Vercel for production/preview.

```env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
VITE_FIREBASE_MEASUREMENT_ID=your-measurement-id

# Optional; only needed if a future feature uses Firebase Storage.
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com

# Optional client-side error reporting endpoint. When set, uncaught UI errors and
# React error-boundary crashes are POSTed here as JSON (no-op when left blank).
VITE_ERROR_REPORT_URL=

FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
BOOTSTRAP_ADMIN_EMAILS=<bootstrap-admin-email-1>,<bootstrap-admin-email-2>
```

Optional Google Sheets audit sync:

```env
INTERNAL_WEBHOOK_SECRET=your-shared-secret
GCP_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
GCP_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
AUDIT_SHEET_ID=your-google-sheet-id
```

Optional transactional email for booking, access, training, and maintenance notifications:

```env
EMAIL_PROVIDER_API_KEY=your-email-provider-api-key
NOTIFICATION_FROM_EMAIL=AML Lab <no-reply@your-domain.example>
EMAIL_PROVIDER_ENDPOINT=https://api.resend.com/emails
```

Never commit `.env`, service account JSON, or private keys.

## Local Development

```bash
npm ci
npm run dev
```

Open <http://localhost:5173>.

## Validation

```bash
npm run lint
npm test
npm run test:rules
npm run build
npm run vercel-build
npm audit --omit=dev
```

`npm run test:rules` requires Java because it starts the Firestore emulator. Run it before production rule deployments and in CI environments that have Java available.

## Admin & Operations Scripts

These read `FIREBASE_ADMIN_*` (or `GCP_*`) credentials from `.env.local`.

| Command | Purpose |
| --- | --- |
| `npm run grant:admin -- <email> --apply` | Grant a user the admin role + active status in Firestore and mark their Auth email verified (admins must be verified to sign in). Omit `--apply` for a dry run. |
| `npm run inspect:users -- <email...>` | Print Auth + Firestore profile state for emails — diagnoses "can't verify" / "no admin access" reports. |
| `npm run migrate:hardening` | Dry-run the data-normalization migration (`node scripts/migrate-production-hardening.js --apply` to write). |
| `npm run deploy:firestore` | Deploy Firestore rules **and** indexes (`deploy:rules` / `deploy:indexes` to do one). |

> Deploy indexes whenever `firebase/firestore.indexes.json` changes. A missing composite
> index surfaces as a 500 on the affected query; the notification list has an in-memory
> fallback, but every declared index should still be deployed.

## End-to-End Testing (real project)

A local harness runs the full stack against a real Firebase project — no passwords required.

```bash
npm run seed:e2e               # create labeled student/faculty/admin test accounts (pre-verified)
npm run dev:api                # start the local /api server (Vite proxies /api here)
npm run dev                    # start the frontend (separate terminal)
npm run e2e:smoke              # exercise every endpoint + business rule, then auto-clean its data
npm run seed:e2e -- --delete   # remove the seeded test accounts when finished
```

`e2e:smoke` mints ID tokens through the Admin SDK (no passwords), then asserts the full
authorization matrix, machine CRUD, the training gate, booking lifecycle + overlap locks,
the maintenance gate, notifications, faculty approvals, user management, and audit logging —
deleting all data it creates afterward. It targets `dev:api` on `http://127.0.0.1:3001`.

## Production Readiness

Code passing locally is not the same as production sign-off. A release is production-ready only after:

- The branch preview deploy builds successfully on Vercel.
- Preview env vars point to the intended Firebase project.
- Firestore rules and indexes are deployed to the intended Firebase project.
- `npm run test:rules` passes in an environment with Java.
- The hardening migration dry-run is reviewed; apply mode is run only after approval.
- Bootstrap admin emails are configured only in Vercel/Firebase environment, never in source or docs.
- Manual student, faculty, and admin flows pass the production QA checklist.

See [RELEASE_READINESS.md](./RELEASE_READINESS.md) for the rollout sequence.

## Firebase Setup

This repository targets a single Firebase project, `lab-dashboard-2809` (the `default` alias in `.firebaserc`).

1. Enable Email/Password sign-in in Firebase Authentication.
2. Create the default Firestore database in production mode.
3. Deploy Firestore rules and indexes (whenever anything under `firebase/` changes):

```bash
npm run deploy:firestore
```

4. Run the hardening migration dry-run before applying data normalization:

```bash
npm run migrate:hardening
```

5. Apply only after reviewing the dry-run report:

```bash
node scripts/migrate-production-hardening.js --apply
```

This is a single-app, single-environment setup (one Firebase project, one Vercel app, one `main` branch). Validate changes with the local end-to-end harness (see "End-to-End Testing"), which seeds clearly-labeled test accounts against this project and removes its own data afterward.

## Vercel Deployment

The Vercel project must have:

- Build command: `npm run vercel-build`
- Output directory: `dist`
- Install command: `npm ci`
- Node.js runtime: Node 22.x
- Required Firebase client env vars, Firebase Admin env vars, and `BOOTSTRAP_ADMIN_EMAILS`

After Vercel env vars are configured:

```bash
npm run vercel-build
vercel --prod
```

## Data Model

- `profiles/{uid}`: account profile, role, status, approval metadata, university metadata.
- `machines/{machineId}`: lab equipment catalog and availability.
- `bookings/{bookingId}`: student booking requests and review state.
- `booking_slots/{machineId}_{date}_{HHmm}`: server-owned conflict locks.
- `lab_config/default`: lab hours, active weekdays, and booking limits.
- `maintenance_windows/{windowId}`: machine or whole-lab blocked time.
- `training_records/{studentId_machineId}`: machine training eligibility.
- `notifications/{notificationId}`: user-facing in-app/email notification state.
- `audit_log/{logId}`: restricted audit records.

## Security Model

- Email verification is required for protected app access.
- Faculty access is admin-approved; faculty signup is a request, not privilege.
- Client writes to `bookings`, `booking_slots`, and `machines` are denied.
- Critical mutations run through server-side Firebase Admin SDK routes.
- Bootstrap admins are controlled by `BOOTSTRAP_ADMIN_EMAILS`.
- Audit sync escapes spreadsheet formula prefixes and writes with RAW input mode.
- Training-required machines are blocked until a faculty/admin training record approves the student.
- Lab hours and maintenance windows are enforced by trusted booking APIs.

## CI

`.github/workflows/ci.yml` runs:

```bash
npm ci
npm run lint
npm test
npm run build
npm audit --omit=dev
```
