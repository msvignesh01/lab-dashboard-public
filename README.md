# Lab Dashboard

Lab Dashboard is the authenticated booking and operations portal for an institutional fabrication lab. Students request machine time, faculty review bookings and manage day-to-day operations, and administrators control access and lab policy.

This repository now has one frontend: the Next.js application in `app/` and `components/`. The previous client application is not part of the runtime or deployment path.

## Architecture

- Next.js 16 and React 19 render the public site, authentication screens, and role-aware portal.
- TypeScript is used throughout the frontend and service layer. The supported runtime is Node.js 22 with npm 10.
- Firebase Authentication provides email/password identity and verified-email state.
- Cloud Firestore stores profiles, machines, bookings, availability locks, training records, maintenance windows, notifications, configuration, rate-limit records, and audit history.
- `pages/api/[...path].js` is the trusted Next.js Pages API facade for `/api/*`. It delegates to the handlers under `api/` and `server/`.
- Profile registration, profile edits, and every operational data read/write use validated trusted API routes; the browser has no direct Firestore data path.
- Firebase Admin SDK credentials are loaded only by trusted server code. The browser never receives service-account credentials.
- Firestore Security Rules close the entire browser data plane. Reads and writes are performed by the API only after token, immutable identity, profile, status, role, and payload checks.

The browser obtains a Firebase ID token and sends it as a bearer token to same-origin `/api/*` routes. Client-side navigation is a usability boundary only; the API is the authorization boundary.

## Roles And Account Lifecycle

| Role | Signup and activation | Portal capabilities |
| --- | --- | --- |
| Student | Self-signup with `@btech.christuniversity.in`; email verification is required. The profile starts `active`. | View active machines and availability, request bookings, view or cancel eligible own bookings, and view own training state. |
| Faculty | Self-signup with `@christuniversity.in`; email verification and administrator approval are required. The profile starts `pending_approval`. | View machines and availability; review bookings; manage machine operations, maintenance, and training; and inspect redacted audit history. |
| Admin | Provisioned through the bootstrap allowlist or an explicit administrator role change; verified email is required. | All faculty capabilities plus faculty-request decisions, user roles/status, and lab configuration. |

Suspended profiles cannot use protected portal operations. Administrator endpoints reject self-role and self-status changes so an administrator cannot accidentally remove their own access through the portal.

See [ACCESS_MANAGEMENT.md](./ACCESS_MANAGEMENT.md) for operator procedures.

## Repository Layout

```text
app/                 Next.js App Router pages, layouts, and route-level UI states
components/          Portal, authentication, marketing, and shared UI components
hooks/               Auth and client-state hooks
lib/                 Client utilities, types, validation, navigation, and Firebase setup
services/            Typed browser services for Firebase Auth and trusted API calls
pages/api/           Next.js Pages API catch-all facade
api/                 API router shared by the facade
server/              Trusted handlers, authorization, validation, transactions, and audit code
shared/              Validation and constants shared by browser-independent server/tests
firebase/            Firestore rules, indexes, emulator tests, and Firebase notes
scripts/             Controlled admin and data-hardening utilities
.github/workflows/   CI and guarded Firestore deployment workflows
```

## Environment Configuration

Copy `.env.example` to `.env.local` for local development. Configure the same canonical names in each deployment environment.

Required public Firebase web configuration:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

`NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, and `NEXT_PUBLIC_SITE_URL` are optional. `NEXT_PUBLIC_SITE_URL` becomes the Next.js metadata base when set; the authentication initializer requires only the five Firebase values shown above, and the current product does not require Firebase Storage.

Required trusted-server configuration:

```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
BOOTSTRAP_ADMIN_EMAILS=<primary-admin-email>,<secondary-admin-email>
```

Optional notification-email configuration is documented in `.env.example`.

Canonical browser variables use the `NEXT_PUBLIC_*` prefix. `next.config.mjs` temporarily maps the previous `VITE_FIREBASE_*` names only when the canonical value is absent, so existing deployment environments can be migrated without an abrupt outage. Do not add new legacy-prefixed values. Migrate every local, preview, and production environment to `NEXT_PUBLIC_*`, verify it, then remove the compatibility aliases in a later controlled release.

Never commit `.env.local`, service-account JSON, private keys, provider credentials, or real privileged email addresses.

Production Firestore indexes and rules deploy as two explicit dispatches of the manual `firestore-production` environment-gated GitHub workflow. Deploy `indexes` and wait for readiness before application promotion; after the matching application/API artifact passes its trusted-endpoint smoke gate, deploy `rules`. The workflow accepts only an exact commit already reachable from `main`; neither component deploys automatically on a `main` push. Preview uses the equivalent explicit-project CLI sequence in the release runbook.

Configure required reviewers, restrict deployments to the `main` branch, and set environment-scoped `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `FIREBASE_DEPLOY_SERVICE_ACCOUNT` variables on `firestore-production`. Deployment uses short-lived GitHub OIDC/Google credentials; no long-lived `FIREBASE_TOKEN` is accepted by the workflow.

## Local Development

Prerequisites:

- Node.js 22.x
- npm 10.9.x
- Java when running the Firestore rules emulator suite

Install and start the application:

```bash
npm ci
npm run dev
```

Next.js serves the local application at <http://localhost:3000> unless a different port is supplied.

## Validation Commands

| Command | Purpose |
| --- | --- |
| `npm run lint` | Run the Next.js-aware ESLint configuration. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run unit and policy tests that do not require the emulator. |
| `npm run test:rules` | Start the Firestore emulator and run Security Rules tests; Java is required. |
| `npm run test:smoke` | Start the completed production build and verify public pages, security headers, the unauthenticated private-API boundary, and retired-route denial. |
| `npm run verify` | Run lint, typecheck, and non-emulator tests. |
| `npm run build` | Produce a production Next.js build. |
| `npm run vercel-build` | Run verification and then the production build. |
| `npm audit --omit=dev` | Review production dependency advisories. |

Run and record the relevant gates for each release. A command being listed here is not a claim that it passed for a particular commit.

## Firebase Setup And Deployment

1. Enable Email/Password authentication in the intended Firebase project.
2. Set Firebase Authentication Password Policy to **Require**, with 8–128 characters plus lowercase, uppercase, numeric, and non-alphanumeric requirements. Browser validation is user experience only; the project policy is the authoritative direct-API control. See [Firebase password policy](https://firebase.google.com/docs/auth/android/password-auth#recommended_set_a_password_policy).
3. Enable [email-enumeration protection](https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection). Verify generic sign-in/reset behavior and record the documented residual that an existing-email signup still returns `EMAIL_EXISTS`.
4. Put Identity Platform [reCAPTCHA Enterprise bot protection](https://cloud.google.com/identity-platform/docs/recaptcha-enterprise) for the email/password provider in audit mode, validate metrics and all authorized web domains, then require **ENFORCE** before production go-live. This protects direct sign-up/sign-in/reset calls that do not pass through the application API.
5. Create Cloud Firestore in Native mode.
6. Review `firebase/firestore.rules` and `firebase/firestore.indexes.json`.
7. Exercise the rules locally with `npm run test:rules`.
8. Review and enable the Firestore TTL policy for `rate_limits.expires_at` in each target project; the field is stored as a Firestore Timestamp.
9. Deploy indexes and rules separately to an explicitly selected project and in the release-runbook order:

```bash
npm run deploy:indexes -- --project <firebase-project-id>
npm run deploy:rules -- --project <firebase-project-id>
```

The repository intentionally has no Firebase default-project alias, so local deploy commands fail unless the operator supplies an explicit project. Never weaken rules to make a UI operation succeed; fix the data shape, account state, or trusted API path.

Before applying a data-hardening migration, create or verify an appropriate Firestore backup/export, run the dry-run, review its masked identity findings, document-ID mismatch warnings, booking-lock completeness warnings, and proposed updates, then obtain change approval:

```bash
npm run migrate:hardening
node --env-file=.env.local scripts/migrate-production-hardening.js --apply
```

The second command changes data and must not be run merely because the dry-run completed.

## Administrator Utilities

These commands read trusted Firebase credentials from `.env.local`.

| Command | Purpose |
| --- | --- |
| `npm run grant:admin -- <email>` | Preview an administrator grant without writing. |
| `npm run grant:admin -- <email> --apply --actor-uid <active-admin-uid>` | Atomically grant active admin access and record the approving administrator; the target email must already be verified. |
| `npm run migrate:hardening` | Inspect proposed data normalization without applying it. |
| `npm run deploy:rules -- --project <firebase-project-id>` | Deploy only Firestore rules to an explicit target. |
| `npm run deploy:indexes -- --project <firebase-project-id>` | Deploy only Firestore indexes to an explicit target. |

Prefer the dry-run form first. Record all privilege and data changes in the institutional change record.

## Vercel Deployment

`vercel.json` selects the Next.js framework, `npm ci`, and `npm run vercel-build`. Configure the project for Node.js 22 and do not set a static output directory override; Vercel must deploy the Next.js application and its trusted Pages API functions together.

For preview and production environments:

1. Configure the environment-specific public Firebase values.
2. Configure the matching Firebase Admin credentials and bootstrap allowlist.
3. Keep preview and production data/credentials isolated.
4. Build the branch and inspect the preview deployment.
5. Run the role-based checks in [QA_CHECKLIST.md](./QA_CHECKLIST.md).
6. Promote only the exact deployment that was approved.

Do not deploy the frontend as static hosting by itself. Without the same-origin `/api/*` facade, protected operations will fail and the intended server authorization boundary is absent.

## Data Model

- `profiles/{uid}`: identity-linked profile, requested/effective role, and lifecycle metadata.
- `machines/{machineId}`: machine catalog, state, training requirement, and specifications.
- `bookings/{bookingId}`: booking request, decision, cancellation, and reviewer metadata.
- `booking_slots/{machineId}_{date}_bucket_{HHmm}`: versioned 15-minute lock buckets containing exact active reservations. Legacy per-minute documents are inert compatibility data and are cleaned only by an approved offline maintenance task.
- `schedule_guards/{scope}`: server-owned serialization guards coordinating booking and maintenance transactions.
- `lab_config/default`: lab hours, operating weekdays, advance window, and duration limit.
- `maintenance_windows/{windowId}`: machine-scoped or lab-wide blocked periods.
- `training_records/{studentId_machineId}`: active or revoked machine training eligibility.
- `notifications/{notificationId}`: per-user in-app/email notification state.
- `rate_limits/{limitId}`: server-owned API rate-limit state with Timestamp-based TTL expiry.
- `audit_log/{logId}`: restricted operational audit history.

## Security Notes

- Protected API calls require a verified Firebase ID token whose UID and normalized institutional email match the immutable server-loaded profile.
- Active status and role are checked again for every privileged handler.
- Booking creation/review/cancellation and slot-lock changes use trusted transactions.
- Approval revalidates the current student, machine, training, lab-hours, duration, maintenance, competing-booking, and lock state; maintenance creation/reactivation rejects active booking conflicts.
- Profile creation and editing are server-validated and audit-coupled; Firestore rules deny every direct browser read and write across all application collections.
- Account suspension/reactivation coordinates Firebase Auth and Firestore fail-closed and records sync ownership. Fresh `pending` operations remain locked; after a 15-minute lease, an administrator can recover only the recorded target. A `failed` operation is likewise retryable only toward its recorded target, and target reversal is rejected.
- Firebase project configuration, not browser validation, authoritatively enforces password complexity. Email-enumeration protection covers sign-in/reset behavior, while enforced reCAPTCHA Enterprise bot protection controls direct email/password abuse, including the signup endpoint's documented `EMAIL_EXISTS` residual.
- The browser uses Firebase only for Authentication and reaches all application data through same-origin `/api/*` services.
- Student machine visibility excludes inactive machines; faculty and administrators can inspect them for operations.
- Training-required machines, maintenance windows, configured hours, and booking limits are enforced by the server.
- The Content Security Policy and other response headers are generated by `proxy.ts`.
- Audit filters execute in Firestore with stable cursor pagination; faculty receive redacted metadata while administrators receive the full authorized record. Audit and user workspaces expose explicit load-more controls instead of truncating at the first page.

The Digital ID page is an on-screen convenience showing the authenticated profile. It is not a cryptographically signed credential, physical access badge, proof of identity, or authorization token. Every operational action remains subject to server authorization.

## Release Process

Use [RELEASE_READINESS.md](./RELEASE_READINESS.md) for staged rollout, evidence, approval, monitoring, and rollback. Use [QA_CHECKLIST.md](./QA_CHECKLIST.md) for repeatable technical and role-matrix validation.

CI installs with Node.js 22, pins Temurin 21 for the emulator, and runs lint, generated-route typechecking, unit tests, server-only Firestore rules tests, the production build, a production-server smoke test, and a production dependency audit.
