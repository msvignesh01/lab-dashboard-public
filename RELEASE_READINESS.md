# Release Readiness And Rollback

Lab Dashboard is production-intended institutional software. A merge, successful local build, or available deployment is not production approval. Each release requires evidence that the Next.js application, trusted API facade, Firebase project, Firestore rules/indexes, and account lifecycle work together in the selected environment.

## Release Ownership

Assign named people before rollout:

- release owner: coordinates the change and final decision;
- technical verifier: reviews build, API, rules, and deployment evidence;
- lab operations verifier: exercises real student/faculty/admin workflows;
- data owner: approves Firestore migration or restoration activity;
- security/access owner: approves bootstrap and privileged-access changes;
- rollback operator: has access to Vercel and Firebase and is available through the observation window.

No person should approve their own privileged access change as the only reviewer.

## Release Unit

Treat these as one compatibility unit:

- Next.js 16 / React 19 browser application;
- Next.js Pages API facade at `/api/*`;
- trusted handlers and Firebase Admin authorization policy;
- Firestore Security Rules and indexes;
- environment-variable schema;
- any approved Firestore data migration.

Rolling back only one layer can create an authorization or data-shape mismatch. Before promotion, identify the last known-good compatible set and keep its deployment, rules/index revisions, configuration record, and data backup reference available.

## Mandatory Evidence

A release is not ready until the change record contains:

- reviewed Git commit and diff;
- clean-install, lint, typecheck, unit-test, production-build, production-server smoke, and dependency-audit results;
- Firestore rules emulator result from an environment with Java;
- temporary preview deployment ID/URL and explicit preview Firebase target when the approved test plan requires a hosted release candidate;
- completed student/faculty/admin matrix from [QA_CHECKLIST.md](./QA_CHECKLIST.md);
- accessibility/responsive and browser smoke evidence;
- Firebase Auth password-policy, email-privacy, reCAPTCHA, authorized-domain, quota/monitoring evidence;
- Firestore rules/index diff and deployment approval, when changed;
- dry-run report, backup/export reference, and data-owner approval for any migration;
- production target confirmation, promotion approval, monitoring owner, and rollback decision point.

Do not store private keys, tokens, bootstrap email values, or bypass secrets in the evidence package.

## Environment Migration

Canonical browser configuration uses `NEXT_PUBLIC_FIREBASE_*`. `next.config.mjs` contains a temporary compatibility mapping from the previous `VITE_FIREBASE_*` names when the canonical value is missing.

For each local, preview, and production environment:

1. Inventory the existing variable names without copying secret values into tickets or logs.
2. Add and verify the canonical `NEXT_PUBLIC_*` value.
3. Redeploy; public variables are embedded at build time.
4. Exercise authentication and a protected same-origin API request.
5. Mark the environment migrated in the change record.

Do not delete an old environment value until its canonical replacement is verified in a new deployment. Do not add legacy-prefixed variables to a new environment. Remove the compatibility mapping only in a later release after every environment is confirmed migrated.

## Firebase Authentication Platform Controls

Browser validation is not an identity-provider security boundary because Firebase web configuration and Auth endpoints are public. Before production promotion:

1. Set Firebase Authentication Password Policy to **Require** with minimum 8, maximum 128, and required lowercase, uppercase, numeric, and non-alphanumeric characters. Prove a weaker direct signup is rejected.
2. Enable improved email-enumeration protection and verify generic sign-in/password-reset behavior. Existing-email signup still returns `EMAIL_EXISTS` for the application's interrupted-registration recovery path; record that residual explicitly.
3. Enable Identity Platform reCAPTCHA Enterprise bot protection for the email/password provider in audit mode, validate metrics and every authorized web domain with the current Firebase SDK, then set production to **ENFORCE**.
4. Review signup quotas, reCAPTCHA/orphan-user metrics, alert thresholds, and a named responder. Direct unsupported-domain signup may create an orphan Auth identity, but trusted profile registration and every protected request must reject it.

Treat a password-policy, email-privacy, or enforced reCAPTCHA regression as a no-go condition. Keep console/API configuration evidence in the change record without credentials or user identities.

## Release-Candidate Validation

1. Create a release branch from the intended base commit.
2. Review the diff for unrelated files, generated artifacts, secrets, temporary data, and obsolete frontend paths.
3. From a clean checkout using Node.js 22 and npm 10.9, run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:rules
npm run build
npm run test:smoke
npm run vercel-build
npm audit --omit=dev
```

4. Record results and resolve or formally accept every exception.
5. Automatic feature-branch deployments are disabled. If the approved test plan requires a hosted release candidate, create one manually and treat it as temporary; otherwise use the clean production-mode build and smoke evidence from the exact commit.
6. For a hosted candidate, configure the approved preview Firebase project's password policy, email-enumeration protection, authorized domains, reCAPTCHA protection, quotas, and monitoring. Exercise reCAPTCHA in audit mode first and then test **ENFORCE** before production approval.
7. Deploy reviewed indexes to the explicit preview project and wait until every required index is ready:

```bash
npm run deploy:indexes -- --project <preview-firebase-project-id>
```

8. Create a manual Vercel preview only when required. Do not configure a static output directory; the Next.js application and trusted Pages API functions must deploy together.
9. Point preview public Firebase values and Firebase Admin credentials to the approved preview project. Never combine a preview browser configuration with production Admin credentials, or the reverse.
10. Configure only the bootstrap and notification values required for the test plan.
11. Smoke-test trusted profile registration/edit plus representative machine, booking, user, and audit reads from the preview artifact while the prior rules remain active.
12. Deploy reviewed deny-all-client-data rules to the explicit preview project:

```bash
npm run deploy:rules -- --project <preview-firebase-project-id>
```

13. Re-run representative trusted API allow/deny checks and prove direct browser Firestore access is denied.
14. Enable/verify the Firestore TTL policy for `rate_limits.expires_at`; this is a separate platform setting, not part of the index JSON.
15. Run the complete role and lifecycle matrix against the preview URL, when one exists, including stale same-target Auth-sync recovery and direct Auth abuse controls.
16. Check production-mode security headers, logs, rate limits, error handling, and optional integrations.
17. Freeze the approved commit and deployment evidence. Any code or environment change invalidates the relevant evidence and must be retested.

If Vercel Deployment Protection is enabled, testers may use authorized Vercel accounts or a deliberately issued temporary access mechanism. Never place bypass material in source, documentation, screenshots, or shared test notes; revoke it after testing.

## Firestore Rules And Indexes

Rules and indexes are versioned with the application but deploy independently.

Before deployment:

1. Review the semantic effect, not only the text diff.
2. Run `npm run test:rules` with Java.
3. Confirm the explicit Firebase project ID.
4. Confirm application code is compatible with both the current and proposed rules during the rollout window, or schedule a controlled maintenance boundary.
5. Identify the prior rules/index commit for rollback.

After each deployment, confirm the selected component and revision. Required indexes must be ready before application promotion; after the later rules phase, prove direct browser denial and representative trusted API allow/deny behavior. A successful CLI response proves neither index readiness nor active authorization behavior.

This release moves the entire Firestore data plane from browser SDK access to trusted API routes. Deploy backward-compatible indexes first and wait for readiness. Deploying the new rules before the new application/API would break data access in the previous frontend, so promote the server/frontend artifact next, smoke profile and representative operational endpoints while the prior rules remain active, then deploy rules immediately in the same approved window and confirm every direct browser Firestore read and write is denied.

Version-2 booking locks use 15-minute bucket documents with exact reservation boundaries. Legacy per-minute locks coexist inertly and must not be deleted in online request transactions. Any later cleanup/backfill is a separate, dry-run-first data maintenance change with backup, counts, and approval.

The production Firestore deployment workflow is manual-only and hard-bound to the `firestore-production` GitHub environment. Configure required reviewers, restrict that environment to deployments from `main`, and set environment-scoped `FIREBASE_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, and `FIREBASE_DEPLOY_SERVICE_ACCOUNT` variables. Dispatch it twice from `main` for the same exact reviewed commit reachable from `main`: select `indexes` and enter `DEPLOY_FIRESTORE_INDEXES` before application promotion; after trusted-API smoke, select `rules` and enter `DEPLOY_FIRESTORE_RULES`. Each dispatch requires the explicit matching project and runs the rules-emulator test. Missing/mismatched configuration, an unsupported component, a non-`main` commit, or a confirmation mismatch fails closed. Authentication uses short-lived GitHub OIDC/Google credentials; long-lived Firebase CI tokens are not used. Preview components deploy with the equivalent explicit-project CLI commands and preview-only credentials.

## Data Migration

The hardening script defaults to dry-run:

```bash
npm run migrate:hardening
```

Before any apply operation:

1. Confirm trusted credentials target the intended project.
2. Create or verify a recoverable Firestore backup/export according to institutional retention policy.
3. Save the backup reference, not its credentials, in the change record.
4. Review counts, masked examples, Auth/profile email mismatches, unsupported domains, role/domain conflicts, disabled or missing Auth users, stored/document-ID mismatches, booking-lock completeness, invalid/orphan findings, and proposed updates from the dry-run.
5. Resolve unexpected findings or define an approved exception.
6. Obtain data-owner approval and define restoration criteria.

Apply only as its own controlled step:

```bash
node --env-file=.env.local scripts/migrate-production-hardening.js --apply
```

Record start/end time, operator, target, output summary, and post-migration verification. Do not assume the migration is automatically reversible. A database restore can overwrite valid post-release activity and therefore requires data-owner and incident-command approval.

## Production Promotion

1. Confirm release-candidate QA was performed against the exact commit to be promoted.
2. Reconfirm the Vercel production project, Firebase project, domain, and environment-variable scope with a second reviewer.
3. Capture the current production deployment, environment revision, rules/index commit, and Firestore backup reference as the rollback baseline.
4. Schedule or announce the change according to institutional policy.
5. Reconfirm password policy **Require**, improved email privacy, reCAPTCHA **ENFORCE**, authorized domains, quotas, alerts, and named Auth-abuse monitoring ownership.
6. Dispatch the protected workflow for `indexes` with `DEPLOY_FIRESTORE_INDEXES`, then wait for readiness.
7. Apply an approved data migration only if it is part of the release plan.
8. Confirm the exact approved commit is reachable from `main`, then deploy that commit to the single Vercel production project.
9. Smoke-test registration, own-profile update, and representative role-scoped reads through the trusted API while the prior rules are still active.
10. Dispatch the protected workflow for `rules` with `DEPLOY_FIRESTORE_RULES`, then verify direct client denial and representative API allow/deny behavior.
11. Enable or verify TTL on `rate_limits.expires_at`.
12. Run a minimal, non-destructive production smoke test for public, student, faculty, and admin paths.
13. Verify the public 3D lanyard is fixed, the authenticated card exposes only edit/save/print, no sharing or flat-card credential fallback exists, and the Digital ID warning remains visible.
14. Confirm every stable production alias targets the new READY deployment and start the defined observation window with unrelated changes restricted.
15. After the observation window closes without a rollback trigger, delete any temporary Vercel preview, superseded Vercel deployments, obsolete GitHub deployment records, and the unused GitHub `Preview` environment. Preserve one canonical READY production deployment and the GitHub `Production` environment.

## Observation And Rollback Triggers

Define thresholds in the change record. Roll back or stop promotion when any of the following is confirmed and cannot be safely corrected within the approved window:

- users cannot sign in, verify, or load server-authoritative profiles;
- password policy, improved email privacy, reCAPTCHA enforcement, Auth quotas, or orphan-user monitoring is missing or degraded;
- students gain access to faculty/admin data or operations;
- role, status, or faculty-approval enforcement differs between UI and API;
- booking conflicts, slot locks, maintenance, training, hours, or duration rules are bypassed;
- unexpected data loss, duplicate records, or widespread mutation failure occurs;
- the trusted `/api/*` facade is unavailable or exposes internal/secret detail;
- Firestore permission failures or index errors block core workflows;
- production browser and Firebase Admin configurations point to different projects;
- a secret or privileged identity appears in a bundle, log, or public artifact;
- error rate or latency exceeds the agreed threshold;
- the institution's security or operations owner directs rollback.

Security boundary failures require immediate containment even if application rollback is also planned.

## Rollback Procedure

### 1. Contain

1. Pause promotion, migrations, rules changes, and unrelated operator activity.
2. Record the incident time, symptoms, affected roles/data, and last known-good state.
3. If access is over-permissive, disable affected Firebase Auth accounts or integrations and restrict traffic using approved platform controls.
4. Preserve logs and evidence without copying tokens or sensitive data into general channels.

### 2. Application And API

1. Select the last known-good Vercel deployment that is compatible with the active Firestore rules, indexes, configuration, and data shape.
2. Promote that immutable deployment using the authorized Vercel rollback process.
3. Confirm the domain resolves to it and `/api/profile/me` plus representative allowed/denied APIs behave correctly.
4. Do not roll back only the browser assets while leaving an incompatible trusted API or environment schema.

### 3. Environment Configuration

1. Restore values from the approved secure configuration record; never reconstruct secrets from logs or source.
2. Redeploy because `NEXT_PUBLIC_*` values are embedded during build and server variables are deployment-scoped.
3. Verify browser Firebase configuration and Firebase Admin target match.
4. The temporary legacy-name fallback may reduce outage risk during the migration, but it is not a substitute for restoring known-good canonical configuration.

### 4. Firestore Rules And Indexes

1. Review the prior rules/index commit and its compatibility with the selected application deployment.
2. Deploy the approved prior version to the explicit project.
3. Re-run representative allow/deny tests after activation.
4. Treat index deletion or recreation carefully; build/removal is asynchronous and may affect live queries. Prefer leaving a harmless extra index during emergency rollback over making an unreviewed destructive index change.

### 5. Data

1. Stop further writes when data integrity is uncertain, using institution-approved controls.
2. Compare affected documents with the migration report and backup/export.
3. Prefer a reviewed, narrowly scoped compensating change when safe.
4. Restore a database/export only with data-owner approval and a plan for valid writes created after the backup.
5. Reconcile slot locks, bookings, profile lifecycle, training, notifications, and audit history before reopening normal operation.

### 6. Verify And Communicate

1. Repeat critical student/faculty/admin authorization tests.
2. Confirm monitoring has returned to the accepted baseline.
3. Communicate service state and known data impact through approved institutional channels.
4. Preserve the incident timeline and open follow-up work before resuming feature deployment.

## Go/No-Go Record

| Decision item | Evidence | Owner | Status |
| --- | --- | --- | --- |
| Reviewed commit and scope |  |  |  |
| Automated gates |  |  |  |
| Rules emulator |  |  |  |
| Hosted-preview role matrix, if used (otherwise N/A) |  |  |  |
| Environment migration/target check |  |  |  |
| Firebase Auth platform controls |  |  |  |
| Rules/index approval |  |  |  |
| Backup and migration approval, if applicable |  |  |  |
| Security/access review |  |  |  |
| Production promotion approval |  |  |  |
| Rollback baseline and operator |  |  |  |
| Observation window |  |  |  |

Final decision: Go / No-go

Decision maker:

Date/time:

Known risks and accepted exceptions:

Follow-up owner and due date:
