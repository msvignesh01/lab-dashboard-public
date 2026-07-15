# Firebase Backend Operations

Firebase supplies identity and data services for Lab Dashboard. The application runtime remains Next.js: the browser uses Firebase Authentication only, while every profile and operational data read/write goes through the same-origin Next.js Pages API facade at `/api/*`. Trusted handlers use Firebase Admin SDK after binding the caller's token UID and institutional email to the immutable Firestore profile, then checking lifecycle status and role.

Do not deploy only the browser application without the trusted API. Do not move Firebase Admin credentials into `NEXT_PUBLIC_*` values or browser code.

## Services In Use

- Firebase Authentication with Email/Password sign-in, verified-email state, enforced password policy, improved email privacy, and Identity Platform reCAPTCHA Enterprise bot protection.
- Cloud Firestore in Native mode.
- Firestore Security Rules from `firebase/firestore.rules`.
- Composite indexes from `firebase/firestore.indexes.json`.
- Firebase Admin SDK in trusted server handlers and controlled scripts.
- Firestore emulator for Security Rules tests.

Firebase Storage is optional and not required by current workflows. Firebase Functions, Firebase Hosting, and Firebase App Hosting are not the runtime for the current architecture.

## Configuration Files

- `firebase.json`: rule and index source paths.
- `firebase/firestore.rules`: browser authorization policy.
- `firebase/firestore.indexes.json`: required query indexes.
- `firebase/firestore.rules.test.js`: emulator-backed allow/deny tests.
- `.github/workflows/deploy-firebase.yml`: manual, production-environment-gated deployment of one reviewed Firestore component (`indexes` or `rules`) per dispatch.

There is intentionally no `.firebaserc` default project. Local deployment therefore requires `--project`. Production deployment requires `firestore-production` environment approval, a deployment-branch restriction to `main`, plus `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `FIREBASE_DEPLOY_SERVICE_ACCOUNT` environment variables. The workflow uses short-lived GitHub OIDC/Google credentials, accepts only an exact commit reachable from `main`, and fails rather than skipping when configuration does not match.

## Environment Boundary

Browser Firebase configuration uses canonical `NEXT_PUBLIC_FIREBASE_*` variables. These identify the Firebase web app and are embedded into the Next.js browser bundle at build time.

Trusted server code uses:

```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=your-service-account@your-project-id.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
BOOTSTRAP_ADMIN_EMAILS=<approved-admin-email-list>
```

The browser and Admin project IDs must match the intended environment. Preview browser configuration must never be combined with production Admin credentials, or vice versa.

`next.config.mjs` temporarily maps previous `VITE_FIREBASE_*` browser variable names when their canonical `NEXT_PUBLIC_*` equivalents are absent. This is migration compatibility only. Configure new environments with `NEXT_PUBLIC_*`, migrate existing environments one at a time, rebuild, verify authentication/API calls, and remove the aliases in a later release after every environment is canonical.

Never commit service-account JSON, private keys, tokens, bootstrap identities, real environment files, or provider credentials.

## Collections

- `profiles/{uid}`: identity-linked profile, requested/effective role, status, approval, suspension, and verification metadata.
- `machines/{machineId}`: machine catalog, active state, training requirement, image URL, and specifications.
- `bookings/{bookingId}`: student booking requests and review/cancellation state.
- `booking_slots/{machineId}_{date}_bucket_{HHmm}`: server-owned version-2 15-minute buckets whose reservation map retains exact start/end minutes for pending/approved conflict detection.
- `schedule_guards/{scope}`: server-owned version documents that serialize booking and maintenance transactions.
- `lab_config/default`: opening/closing time, active weekdays, maximum advance window, and duration limit.
- `maintenance_windows/{windowId}`: active/cancelled machine-specific or whole-lab blocked periods.
- `training_records/{studentId_machineId}`: active/revoked machine training eligibility.
- `notifications/{notificationId}`: per-user in-app and optional email delivery state.
- `rate_limits/{limitId}`: server-owned request-rate state; `expires_at` is a Firestore Timestamp intended for a TTL policy.
- `audit_log/{logId}`: restricted operational audit records.

Document IDs are operational references, not identity credentials. Preserve stable UIDs and record IDs when retaining audit/history relationships.

## Security Rules Model

The browser data plane is completely closed by Security Rules:

- every direct client read and write across every application collection is denied, regardless of authentication or claimed role;
- trusted `POST /api/profile/register` derives identity and lifecycle fields from the verified Firebase token and validated institutional signup data, then creates the profile and audit record atomically;
- trusted `PATCH /api/profile/me` validates editable fields and commits the profile change and audit record atomically;
- trusted API handlers provide role-scoped, filtered, redacted, and paginated responses through Firebase Admin SDK;
- the browser Firebase bundle initializes Authentication but not Firestore.

Firebase Admin SDK bypasses Firestore Security Rules. Therefore every trusted handler must continue to validate the Firebase ID token, token/profile UID and normalized-email equality, institutional domain/role mapping, active status, role, identifiers, payload, rate limit, and transactional invariants. A passing browser rules test does not replace API authorization tests.

Do not loosen rules to make a UI operation work. Fix the caller's account state, data shape, query, or trusted API implementation.

## Authentication And Profiles

Student signup is permitted only for the configured student institutional domain. The authenticated, idempotent registration endpoint creates an active student profile; protected access still requires Firebase email verification. If browser work is interrupted after Firebase Auth creation, retrying with the same credentials safely resumes registration instead of deleting a partially registered identity.

Faculty signup is permitted only for the faculty institutional domain and creates a `pending_approval` profile. After verification, the user signs in so the trusted profile endpoint can record verified state. An active administrator must approve the request before protected faculty operations are available.

The institutional-domain boundary is enforced by trusted profile registration and every protected request, not by the browser alone. Because the Firebase web API is public, direct signup can still create an orphan Auth identity for an unsupported domain; it must never create a profile or gain protected data access. Configure Firebase Password Policy as **Require** for 8–128 characters with lowercase, uppercase, numeric, and non-alphanumeric requirements. Enable improved email-enumeration protection for generic sign-in/reset behavior. Existing-email signup still returns `EMAIL_EXISTS` for the interrupted-registration recovery path, so production also requires Identity Platform reCAPTCHA Enterprise email/password protection in **ENFORCE**, reviewed signup quotas/metrics, orphan-user monitoring, and an alert owner. Use audit mode first and verify all authorized web domains/current SDK flows before enforcement.

Suspended profiles are denied protected access. The normal admin suspension endpoint also attempts to disable the Firebase Auth user. For emergency containment, operators should coordinate both Authentication disabled state and Firestore profile status.

Status synchronization is fail-closed across the two systems: suspension blocks the Firestore profile before disabling Auth; activation leaves the profile suspended until Auth succeeds. Audited `auth_sync_*` metadata records operation ownership. A fresh `pending` operation cannot be retried concurrently. After its 15-minute lease, the server exposes only a same-target recovery; `failed` operations are also retryable only toward their recorded target. Opposite-target recovery is rejected, and the staging transaction allows only one owner. A stale takeover writes `user.status_sync_recovered` with prior/new operation linkage and the prior sync timestamp.

## Bootstrap Admin

Set `BOOTSTRAP_ADMIN_EMAILS` in the trusted deployment environment to a minimal comma-separated list of approved verified institutional accounts. When a matching verified user calls the trusted API, the server creates or normalizes that profile to active admin.

Changing the allowlist requires a new deployment. Removing an email from the allowlist does not automatically demote a profile already normalized as admin; reconcile the user role/status separately. Keep at least two controlled recovery paths and review them periodically.

See [`ACCESS_MANAGEMENT.md`](../ACCESS_MANAGEMENT.md) for onboarding, approval, suspension, recovery, and periodic-review procedures.

## Local Rules Testing

Install dependencies and run:

```bash
npm ci
npm run test:rules
```

Java is required because Firebase CLI starts the Firestore emulator. The suite proves that anonymous, student, faculty, and administrator browser clients cannot directly read or write any application collection. CI pins Temurin 21 and runs the suite against the synthetic `lab-dashboard-rules-test` project ID.

Use emulator/test projects and synthetic accounts. Do not run destructive test seeding against production.

## Deploy Rules And Indexes

1. Review the semantic diff.
2. Run `npm run test:rules`.
3. Obtain deployment approval.
4. Verify the explicit Firebase target with a second reviewer.
5. Deploy indexes, wait until they are ready, deploy the compatible application/API, smoke trusted endpoints, and only then deploy rules:

```bash
npm run deploy:indexes -- --project <firebase-project-id>
npm run deploy:rules -- --project <firebase-project-id>
```

Capture each deployment output/revision. Required indexes must be ready before application promotion; after the later rules phase, verify representative direct browser reads and writes remain denied and exercise role-scoped API reads/writes. A successful CLI response does not prove an index is ready or that the rules are active.

Firestore index deployment does not enable TTL. Separately configure a TTL policy for collection group `rate_limits` on field `expires_at`, record that platform change, and confirm expiry metrics in the intended project.

For the server-only data-plane cutover, deploy backward-compatible indexes first and wait for readiness. Then deploy the server/frontend artifact, smoke-test `POST /api/profile/register`, `PATCH /api/profile/me`, and representative read workspaces while the previous rules remain active. Finally deploy the deny-all-client-data rules immediately in the same approved change window. Deploying those rules before the new API would break data access in the previous application.

Production uses two protected workflow dispatches from `main` for the same reviewed commit: choose `indexes` with confirmation `DEPLOY_FIRESTORE_INDEXES` before application promotion, then choose `rules` with confirmation `DEPLOY_FIRESTORE_RULES` only after trusted-API smoke. Both dispatches require the protected environment, explicit matching project ID, OIDC configuration, rules-emulator success, and the exact reviewed commit.

## Data Hardening Migration

Trusted Firebase Admin credentials for scripts belong in `.env.local`. Run the migration in dry-run mode first:

```bash
npm run migrate:hardening
```

Before apply mode:

- confirm the explicit target project;
- create or verify a recoverable Firestore backup/export;
- review counts, masked examples, stored/document-ID mismatches, booking-lock completeness, invalid/orphan records, and proposed changes;
- obtain data-owner approval;
- define post-change checks and restoration criteria.

Apply only as a controlled, separately recorded change:

```bash
node --env-file=.env.local scripts/migrate-production-hardening.js --apply
```

Do not assume the operation is automatically reversible. A full restore can overwrite legitimate activity after the backup and requires an incident/data reconciliation plan.

## Rules Or Data Rollback

Keep the last known-good application deployment, rule/index commit, configuration record, and Firestore backup reference together as a compatibility set.

- For rules, review and deploy the approved prior file to the explicit project, then repeat representative allow/deny checks.
- Avoid emergency index deletion when leaving an extra index is harmless; index changes are asynchronous.
- For data, stop unsafe writes, compare affected documents, and prefer a reviewed narrow compensating change when possible.
- Restore from backup only with data-owner approval and a plan for valid writes created after the backup.

The complete coordinated procedure is in [`RELEASE_READINESS.md`](../RELEASE_READINESS.md).
