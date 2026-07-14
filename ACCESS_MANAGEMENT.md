# Access Management Guide

This guide is for authorized lab operators who onboard users, approve faculty access, administer roles, and respond to access incidents.

The interface does not grant authority by itself. Firebase Authentication establishes identity; the trusted Next.js `/api/*` facade reloads the Firestore profile and enforces verified token state, UID and immutable-email equality, institutional domain/role mapping, lifecycle status, and role for each protected operation.

## Role And Lifecycle Model

| Account type | Institutional email | Initial profile state | Activation requirement | Normal responsibility |
| --- | --- | --- | --- | --- |
| Student | `@btech.christuniversity.in` | `role: student`, `status: active` | Firebase email verification | View active machines, request bookings, and manage eligible own bookings. |
| Faculty | `@christuniversity.in` excluding the student subdomain | `role: faculty`, `status: pending_approval` | Firebase email verification, then admin approval | Review bookings; manage machines, maintenance, and training; view audit history. |
| Admin | `@christuniversity.in` | Provisioned, not available as a public signup choice | Verified email plus bootstrap or explicit administrator grant | Faculty responsibilities plus faculty requests, user access, roles, and lab settings. |

Lifecycle statuses are:

- `active`: eligible for role-authorized portal operations after email verification.
- `pending_approval`: a faculty request awaiting an administrator decision.
- `suspended`: protected access is denied. The normal admin suspension flow also attempts to disable the Firebase Auth user.

All roles must have a verified Firebase Auth email. A student profile starts `active`, but the verified-email gate still prevents portal access until verification. Faculty approval is a separate gate and must never be inferred from the selected signup role.

The Firebase project must enforce the same minimum password classes shown by the browser (eight or more characters with lowercase, uppercase, numeric, and non-alphanumeric characters). Enable email-enumeration protection for sign-in/reset behavior and enforce Identity Platform reCAPTCHA Enterprise bot protection for the email/password provider before production use. Client checks and browser attempt throttles are not authoritative because the Firebase web configuration is public; existing-email signup can still return `EMAIL_EXISTS`, so reCAPTCHA enforcement and monitoring are required abuse controls.

## Add A Student

1. Direct the student to **Sign up** in the application.
2. Confirm they choose **Student** and use their `@btech.christuniversity.in` address.
3. Have them complete the institutional profile fields and submit.
4. Have them follow the Firebase verification link.
5. Have them sign in and confirm their own dashboard, machine catalog, and booking view load.

No administrator approval is required. If the account remains at the verification gate, use the UI to resend the email and check university mail filtering before making any manual change.

## Add A Faculty Reviewer

1. Direct the faculty member to **Sign up**.
2. Confirm they choose **Faculty** and use their `@christuniversity.in` address, not the student subdomain.
3. Have them verify the Firebase email.
4. Have them sign in after verification. This lets the trusted profile endpoint record verified-email metadata.
5. An administrator opens **Users**, finds **Pending faculty requests**, and reviews the request against the institution's source of truth.
6. Approve or reject the request and record any required operational evidence outside the application.
7. If approved, have the faculty user refresh status or sign in again, then verify the expected faculty navigation.

The system does not list an unverified faculty request as approvable, and the approval endpoint independently checks Firebase Auth verification. A rejected request becomes suspended and retains the rejection reason; it does not become an active student account.

## Bootstrap The First Admin

`BOOTSTRAP_ADMIN_EMAILS` is the controlled bootstrap boundary for verified accounts. It must be set as a secret deployment environment value, never in source or committed documentation.

1. Select the intended deployment environment.
2. Set `BOOTSTRAP_ADMIN_EMAILS` to the smallest practical comma-separated set of approved institutional email addresses.
3. Confirm the corresponding Firebase Auth account exists and its email is verified.
4. Redeploy because server environment changes do not alter an already-built deployment.
5. Sign in with the approved account and call a protected portal route. The trusted API normalizes that profile to active admin.
6. Confirm **Users** (including **Pending faculty requests**) and **Lab Settings** are available.
7. Record the operator, change approval, deployment, and verification result.

Example shape, using placeholders only:

```text
BOOTSTRAP_ADMIN_EMAILS=<primary-admin-email>,<break-glass-admin-email>
```

Keep at least two independently controlled administrator accounts for recovery, but keep the allowlist minimal. Removing an address from the allowlist does not by itself demote an already-provisioned profile; use the user-management process as well.

## Add Or Change An Admin After Launch

Preferred portal flow for an existing verified user:

1. Sign in as a different active administrator.
2. Open **Users**.
3. Select the intended profile and verify identity, current role, and status.
4. Change the role to **Admin** and confirm the action.
5. Have the target user sign out and sign in again.
6. Verify only the expected admin navigation and record the change.

The API rejects self-role changes. This protects the current administrator from accidentally removing their own role and ensures a second administrator participates.

Controlled script flow for provisioning or recovery:

```bash
npm run grant:admin -- <approved-admin-email>
npm run grant:admin -- <approved-admin-email> --apply --actor-uid <active-admin-uid>
```

Run the first command with trusted Firebase credentials in `.env.local`, review the dry-run, then use `--apply` only with authorization. Apply requires a different, verified, enabled, active faculty-domain administrator as the recorded actor. The target must already have a verified, enabled faculty-domain Firebase Auth identity; the script never marks an email verified. Profile elevation and the application audit record commit in one Firestore transaction.

Use direct Firebase Console edits only as a documented break-glass procedure. Console changes can bypass application confirmation, notification, and audit behavior. If emergency recovery requires one, use the exact user UID, preserve profile history fields, have a second operator review it, and create an institutional audit record.

## Suspend Or Reactivate Access

Normal portal flow:

1. Sign in as an active administrator.
2. Open **Users** and verify the target by UID and institutional identity.
3. Select **Suspend** or **Reactivate** and confirm.
4. Verify both the resulting Firestore profile status and Firebase Auth disabled state.
5. If the portal reports a failed authentication synchronization, use **Retry authentication sync** only for the recorded target. A fresh `pending` operation remains locked. If the server marks it recoverable after its 15-minute lease, investigate the original request outcome, then use **Recover stale authentication sync** for that same recorded target. Never reverse a pending or failed target.
6. Record the reason, synchronization result, and evidence.

The API accepts only `active` and `suspended`, rejects self-status changes, and protects the last active administrator. Suspension blocks the server profile before disabling Auth; activation keeps the profile suspended until Auth succeeds. Staged and failed operations are audit-recorded. Fresh `pending` operations are locked; a stale marker becomes same-target recoverable after 15 minutes. Failed markers are also same-target only, opposite-target requests are rejected, and the transaction permits only one recovery owner. A stale takeover emits `user.status_sync_recovered` with the previous and new operation IDs plus the prior sync timestamp, without adding names or email addresses to the recovery metadata.

For urgent containment when the portal is unavailable:

1. Disable the user in Firebase Authentication.
2. Set `profiles/{uid}.status` to `suspended` in Firestore.
3. If the user is a bootstrap admin, remove the address from `BOOTSTRAP_ADMIN_EMAILS` and redeploy.
4. Revoke or rotate any separately issued operational credentials that are outside this application.
5. Document the emergency change and reconcile it through the normal process after service restoration.

Do not delete profiles casually. Bookings, notifications, training records, and audit history rely on stable UIDs. Suspension is the normal reversible control.

## Faculty Request Decisions

Before approval, confirm:

- the email is verified and belongs to the faculty member;
- department and profile details match an authoritative institutional record;
- the requested duties are appropriate;
- the reviewer is not approving their own request through an alternate identity.

Use a meaningful rejection reason without sensitive personal data. Rejection reasons are stored on the profile and should be suitable for later audit.

## Machine And Training Access

Faculty and administrators can manage machines and training records through the protected portal.

- Students see only active machines.
- Machines with booking history are deactivated rather than removed by the API.
- Machine image URLs must use HTTPS.
- Training approval can target only an existing student profile and existing machine.
- A machine marked as training-required cannot be booked by a student without an active matching training record.
- Booking approval revalidates current machine, student, training, lab-hours, duration, maintenance, conflict, and lock state.
- Training revocation prevents new requests and approval of affected pending requests. Operators must still review already-approved future bookings if institutional policy requires cancellation.
- Maintenance creation/reactivation refuses to overlap any pending or approved booking; resolve the booking first.

## Profile Editing

Users may edit only their own non-privileged profile fields, such as name, department, phone, register number, specialization, and year. The browser sends the change to validated `PATCH /api/profile/me`; the server commits the update and audit record together. Firestore rules deny all direct browser reads and writes, so profile data and privileged fields are available only through role-scoped trusted API responses.

Role, status, and approval changes must use the trusted administrator workflows.

## Digital ID Limitations

The portal's Digital ID is an on-screen convenience that displays the currently authenticated profile. It is not a signed credential, physical badge, government or institutional identity document, offline proof, or standalone machine-access authorization. Screenshots and printouts must not be accepted as proof of identity or entitlement. Protected operations are authorized again by the server at the time of the request.

## Periodic Access Review

At the institution's defined review interval:

1. Export or review active admin and faculty profiles through approved tooling.
2. Reconcile them against employment/enrollment and lab-duty records.
3. Review `BOOTSTRAP_ADMIN_EMAILS` in every deployment environment.
4. Suspend stale accounts before considering deletion.
5. Review recent role/status/faculty-decision audit entries.
6. Verify two controlled administrator recovery paths still work.
7. Record reviewer, date, exceptions, and follow-up owner.
