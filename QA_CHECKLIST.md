# Lab Dashboard Release QA Checklist

Use this checklist for a Next.js candidate before promotion and again for production smoke testing. A hosted preview is optional and must be created only when the approved test plan requires one. Record evidence; do not infer success from a local build or from client-side navigation alone.

## Test Record

- Release/branch:
- Commit SHA:
- Preview URL, if used (otherwise N/A):
- Production URL, if applicable:
- Firebase project ID or approved environment label:
- Vercel deployment ID:
- Firestore rules/indexes revision:
- Firebase Auth password-policy/email-privacy/reCAPTCHA evidence:
- Tester(s):
- Test date/time and timezone:
- Change approval/reference:

Use dedicated test accounts and non-sensitive test data. When a hosted preview is used, keep its Firebase credentials and datasets isolated from production.

## 1. Toolchain And Quality Gates

Confirm Node.js 22.x and npm 10.9.x, then run from a clean checkout:

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

`npm run test:rules` starts the Firestore emulator and requires Java. `npm run test:smoke` starts the completed build and checks public routes, security headers, the unauthenticated private-API boundary, and retired-route denial. `npm run vercel-build` repeats lint, typecheck, non-emulator tests, and the production build.

Record each result rather than marking this section complete as a group:

| Gate | Result/link | Reviewer | Notes/waiver |
| --- | --- | --- | --- |
| Clean install |  |  |  |
| Lint |  |  |  |
| Typecheck |  |  |  |
| Unit/policy tests |  |  |  |
| Firestore rules emulator |  |  |  |
| Production build |  |  |  |
| Production-server smoke |  |  |  |
| Vercel build command |  |  |  |
| Production dependency audit |  |  |  |

Any failure, high/critical production advisory, or unexplained warning is a release blocker unless an authorized risk acceptance is attached.

## 2. Deployment Configuration

Confirm the selected Vercel environment uses:

- Next.js framework detection;
- Node.js 22.x;
- install command `npm ci`;
- build command `npm run vercel-build`;
- no static output-directory override;
- automatic Git deployment enabled only for `main`, with feature-branch previews disabled;
- the intended custom domain and `NEXT_PUBLIC_SITE_URL`, if used.

Confirm canonical browser variables exist in that environment:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Review `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, and `NEXT_PUBLIC_SITE_URL` when configured. `NEXT_PUBLIC_SITE_URL` supplies the Next.js metadata base; the authentication initializer does not require these optional values.

Confirm trusted server variables exist and refer to the same intended Firebase project:

- `FIREBASE_ADMIN_PROJECT_ID`
- `FIREBASE_ADMIN_CLIENT_EMAIL`
- `FIREBASE_ADMIN_PRIVATE_KEY`
- `BOOTSTRAP_ADMIN_EMAILS`

Check optional email-provider and storage values only when those features are enabled.

The temporary `VITE_FIREBASE_*` compatibility aliases must not be the planned configuration for a new environment. If an existing environment still relies on one, record it as migration debt, prove the fallback in that environment, and schedule replacement with `NEXT_PUBLIC_*` before removing the compatibility code.

Verify no secret value appears in browser bundles, page source, logs, screenshots, documentation, or the Git diff. Public Firebase web configuration is expected in the browser; Firebase Admin keys, email-provider keys, and privileged addresses are not.

## 3. Firebase And Rules

1. Confirm Email/Password authentication is enabled in the intended Firebase project.
2. Confirm Firebase Authentication Password Policy is **Require**, with minimum 8, maximum 128, and lowercase, uppercase, numeric, and non-alphanumeric requirements. Prove a direct Firebase signup with a weaker password is rejected; the browser check is not the authority.
3. Confirm improved email-enumeration protection is enabled. Verify sign-in and password-reset behavior is generic, and record that existing-email signup still returns `EMAIL_EXISTS` because the idempotent interrupted-registration flow relies on it.
4. Confirm Identity Platform reCAPTCHA Enterprise bot protection is enabled for the email/password provider, all intended web domains are authorized, audit-mode metrics were reviewed, and production is in **ENFORCE**. Verify signup/sign-in/reset still work through the current web SDK and requests without the required assessment are rejected.
5. Review Firebase Authentication signup quotas, reCAPTCHA metrics, orphan-user growth, and alert ownership. Direct Firebase signup can create an Auth user outside the institutional domains, but trusted profile registration must reject it and no protected data access may result.
6. Confirm Cloud Firestore is in Native mode.
7. Verify the explicit project ID selected for rules/index deployment; the repository intentionally has no local default alias.
8. Review the exact changes to `firebase/firestore.rules` and `firebase/firestore.indexes.json`.
9. Run the emulator-backed rules suite.
10. Deploy indexes and rules as separately approved phases in the order defined by the release runbook:

```bash
npm run deploy:indexes -- --project <firebase-project-id>
npm run deploy:rules -- --project <firebase-project-id>
```

11. Capture each deployment output/revision and confirm required composite indexes finish building before application promotion.
12. Confirm a Firestore TTL policy is enabled for `rate_limits.expires_at`; index deployment alone does not enable TTL.

Rules checks must demonstrate that:

- anonymous and authenticated browser clients, including students, faculty, and administrators, cannot directly read or write any application collection;
- role-scoped data remains available only through trusted `/api/*` handlers;
- server registration derives identity/role/status safely and cannot create an admin profile from public signup data;
- server profile edits cannot change role, status, approval, bootstrap, rejection, identity, or creation fields;
- unknown collections remain denied.

## 4. Authentication And Account Lifecycle

Exercise each state with a real Firebase Auth session:

1. Register a student using an approved student-domain test address.
2. Confirm authenticated `POST /api/profile/register` creates the profile and audit record atomically as student/active, while protected portal access remains blocked until email verification.
3. Resend verification and use **Check verification** after following the link.
4. Register a faculty account using an approved faculty-domain test address.
5. Confirm it remains `pending_approval` after email verification.
6. Sign in once after faculty verification so the trusted profile endpoint records verified state.
7. Confirm only an active admin can see and decide the request.
8. Approve one request and reject another with a meaningful, non-sensitive reason.
9. Interrupt/retry registration with the same credentials and verify the endpoint is idempotent; simulate verification-email/display-name/sign-out failure and confirm the UI surfaces the non-destructive warning.
10. Suspend and reactivate a non-admin test account; force Auth synchronization failure, confirm fail-closed state and audit metadata, then retry only the recorded target.
11. Attempt self-role/self-status changes, last-active-admin removal, and a role change on a pending faculty request.
12. Change a target Firebase Auth email or use a mismatched/external-domain legacy profile; confirm runtime access and faculty/admin promotion fail closed.
13. Confirm a fresh `pending` Auth synchronization cannot be retried concurrently. In an isolated test environment, age its server timestamp past 15 minutes and confirm exactly one same-target stale recovery can claim it. Confirm `user.status_sync_recovered` links the prior/new operation IDs and prior timestamp without adding names or email addresses to the recovery metadata. Confirm a same-target `failed` marker can be reconciled and every opposite-target retry is rejected.
14. Test password reset, sign-out, expired/revoked session behavior, and disabled Auth-user behavior.
15. Attempt direct Firebase signup with an unsupported domain. Confirm an orphan Auth identity may be created but `POST /api/profile/register` rejects it, protected access is impossible, and the configured reCAPTCHA/quota monitoring records the attempt.

Expected authorization outcomes:

- invalid sign-in and password-reset behavior does not reveal whether an account exists; existing-email signup remains a documented `EMAIL_EXISTS` residual protected by reCAPTCHA, quotas, and monitoring;
- unverified users see the verification gate;
- verified pending faculty see the approval gate;
- suspended/disabled users cannot use protected operations;
- bootstrap normalization applies only to a verified allowlisted email;
- admin self-role and self-status changes are rejected;
- pending faculty lifecycle cannot be bypassed by a role/status mutation; fresh Auth synchronization is locked, stale pending and failed reconciliation are same-target only, and transactional ownership prevents concurrent recovery;
- sign-out removes access to cached portal routes.

## 5. Role And Route Matrix

Test both navigation visibility and direct URL entry. Then call a representative API for each denied action to prove that authorization is server-side.

| Area/action | Student | Faculty | Admin |
| --- | --- | --- | --- |
| Portal overview | Allow | Allow | Allow |
| Active machine catalog and availability | Allow | Allow | Allow |
| Inactive machine visibility | Deny | Allow | Allow |
| Create/cancel a student-owned booking | Allow, own only | Deny | Deny |
| List booking records | Own only | All | All |
| Review pending bookings | Deny | Allow | Allow |
| Machine and maintenance operations | Deny | Allow | Allow |
| Training approvals/revocations | Deny | Allow | Allow |
| Audit log | Deny | Allow | Allow |
| Faculty access decisions | Deny | Deny | Allow |
| User role/status management | Deny | Deny | Allow |
| Lab settings changes | Deny | Deny | Allow |
| Digital ID view | Allow | Allow | Allow |

For denied cases, confirm the API returns a structured 401/403 response without internal exception, credential, database, or stack details.

## 6. Booking And Availability

1. Load availability for an active machine and future date.
2. Select a 15-minute-increment start/end pair inside one server-confirmed interval and submit a valid future booking as a student.
3. Submit an overlapping request for the same machine/time.
4. Submit the same time against a different machine.
5. Test date, time, purpose-length, maximum-advance, maximum-duration, and lab-hours boundaries.
6. Test a closed weekday.
7. Test machine-specific and lab-wide maintenance windows.
8. Test an inactive machine.
9. Test a training-required machine before approval, after approval, and after training revocation.
10. Approve a pending booking as faculty/admin, then repeat after separately deactivating the machine, revoking training, changing hours/duration, or adding a conflict; each stale request must be rejected safely.
11. Reject another with required comments.
12. Cancel eligible pending and approved future bookings as the owning student.
13. Attempt cancellation by another student and mutation of past/stale or terminal bookings.

Verify Firestore effects as well as UI messages:

- pending/approved conflicts are prevented by version-2 15-minute bucket locks that retain exact reservation boundaries;
- an eight-hour request uses at most 33 lock buckets and stays well below Firestore transaction limits;
- rejection and cancellation release the corresponding locks;
- approval preserves the locks;
- failures do not leave partial booking or lock documents;
- reviewer, comments, timestamps, notification, and audit metadata are correct;
- optional email-provider failure does not roll back the core authorized transaction.

## 7. Machine, Maintenance, Training, And Settings

Machine checks:

1. Create and edit a machine as faculty/admin.
2. Validate required fields, size limits, specifications, and HTTPS image URL handling; confirm string/number substitutes for `is_active` or `requires_training` return 400 instead of being coerced.
3. Confirm students cannot call the management methods.
4. Remove a machine with no booking history.
5. Attempt removal when booking history exists and confirm the machine is deactivated instead.

Maintenance checks:

1. Create a machine-scoped window and a whole-lab window; confirm creation/reactivation refuses any overlap with pending or approved bookings.
2. Test invalid machine IDs, invalid/zero-length ranges, missing reason, and cancellation.
3. Confirm booking availability reflects active windows.

Training checks:

1. Approve by student UID and by registered student email.
2. Reject nonexistent students, non-student profiles, and nonexistent machines.
3. Revoke an active record and confirm future authorization behavior.
4. Confirm missing, misspelled, or unsupported status values return 400 and never default to active training.

Admin settings checks:

1. Change opening/closing time, weekdays, maximum advance days, and maximum duration.
2. Test invalid ranges and an empty weekday set.
3. Confirm students/faculty can read effective configuration but only admins can update it.

Every privileged change should produce the expected audit record; notification-producing actions should target the correct user(s).

## 8. Notifications And Audit

1. Generate notifications through booking decisions, cancellations, training, maintenance, faculty decisions, and user changes.
2. Confirm a user sees only their own notifications.
3. Mark unread items as read and refresh.
4. Confirm faculty/admin can query audit history and students cannot.
5. Check datastore-backed entity/action filters, stable cursor behavior, page limits, and no-store headers with enough representative data to exceed one page.
6. Confirm faculty metadata is allowlist-redacted while an authorized administrator receives the full expected metadata.
7. Force an audited Firestore mutation failure and confirm neither the domain change nor its audit record commits.
8. Traverse multiple audit and user-directory pages through the UI; confirm stable deduplication, filter resets, and explicit incomplete-search messaging until all user pages load.

## 9. API And Browser Security

1. Call `/api/profile/me` without a bearer token and with a malformed/expired token.
2. Attempt a privileged API request with a student's valid token.
3. Attempt to alter client-side role/navigation state and repeat the privileged request.
4. Send an oversized JSON request to the catch-all API and confirm the configured body limit is enforced.
5. Inspect production responses for Content Security Policy, frame denial, MIME sniffing protection, referrer policy, permissions policy, and HSTS.
6. Confirm authentication, Firestore, image, and other required origins work without broadening policy unnecessarily.
7. Inspect logs for sanitized errors and absence of ID tokens, private keys, full credential payloads, and unnecessary personal data.
8. Confirm operational browser requests stay on same-origin `/api/*` and Firebase client endpoints; Firebase Admin is never bundled client-side.
9. Confirm `/api/internal/sync` and arbitrary API paths return private, no-store 404 responses and never initialize a retired handler.

Client route guards may improve the user experience, but only API and rules denial count as an authorization test.

## 10. UI, Accessibility, And Resilience

Test at representative desktop and mobile widths:

- public home, sign-in, signup, verification, pending, suspended, and error states;
- portal overview, machines, bookings, operations, training, users, audit, settings, and Digital ID where authorized;
- loading, empty, validation, server-error, offline/timeout, and retry states;
- mobile navigation, dialogs, dropdowns, sheets, confirmation flows, and toasts;
- keyboard-only navigation, visible focus, Escape behavior, skip link, labels, announcements, and contrast;
- direct refresh and deep links;
- browser back/forward behavior and sign-out redirect;
- long names, departments, reasons, machine descriptions, and narrow screens.

There must be no role switcher, hard-coded production records presented as live data, silent action failure, hydration crash, uncaught configuration secret, or misleading success state.

## 11. Digital ID Safety Check

1. Confirm the public landing-page lanyard is fixed and exposes no input, variant selector, save, print, copy-link, Web Share, LinkedIn, or X control.
2. Confirm the authenticated Digital ID initializes from only the signed-in user's server-loaded profile and exposes edit, save, and print controls only inside the portal.
3. Confirm the product contains no public lanyard/share route, social-share action, shareable credential URL, or alternate flat-card credential fallback. Semantic verified-profile fields may remain for accessibility and account clarity.
4. Confirm client-state manipulation can change only the local card presentation and cannot change the trusted profile, role, status, training, or operational permissions.
5. Confirm both the portal warning and the artwork itself state that the user-customized display, saved image, and printout are not access credentials or authorization evidence.
6. Confirm a saved image, screenshot, printout, or stale browser view cannot authorize an API request.

The Digital ID is a presentation convenience only. It must not be treated as an institutional identity credential, physical access badge, proof of training, or machine authorization.

## 12. Production Smoke And Monitoring

After approved promotion:

1. Confirm the exact tested deployment and commit are live.
2. Load public and authenticated pages from the production domain.
3. Confirm the stable production aliases resolve to the same READY deployment. After the rollback observation window closes, remove superseded Vercel preview/production deployments, obsolete GitHub deployment records, and any unused GitHub `Preview` environment so only the canonical READY production deployment remains.
4. Complete a minimal non-destructive check with student, faculty, and admin accounts.
5. Confirm trusted API health, authentication, rules, indexes, and required notification integrations.
6. Watch error rate, function logs, authentication failures, Firestore errors, and user reports for the defined observation window.
7. Stop rollout and follow [RELEASE_READINESS.md](./RELEASE_READINESS.md) if a rollback trigger is met.

## Sign-Off

- Quality-gate evidence:
- Rules-emulator evidence:
- Preview role-matrix evidence, if a hosted preview was used (otherwise N/A):
- Accessibility/browser evidence:
- Security review:
- Firebase Auth platform-control evidence:
- Data migration approval/evidence, if applicable:
- Firestore rules/index deployment approval:
- Production promotion approval:
- Monitoring window and owner:
- Known issues and accepted risks:
- Rollback owner:
- Final decision: Go / No-go
