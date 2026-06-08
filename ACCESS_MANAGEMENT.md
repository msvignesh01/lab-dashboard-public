# Access Management Guide

This guide is for lab operators who need to onboard students, faculty reviewers, and admins.

## Account Types

| Account type | Email domain | How access is granted | What they can do |
| --- | --- | --- | --- |
| Student | `@btech.christuniversity.in` | Self-signup plus email verification | Browse machines, request bookings, track/cancel own eligible bookings |
| Faculty | `@christuniversity.in` | Self-signup, email verification, then admin approval | Review bookings and manage lab machines, maintenance windows, and training approvals |
| Admin | `@christuniversity.in` | Bootstrap allowlist or explicit admin promotion | Approve faculty access, manage users, configure lab rules, and perform all faculty operations |

All users must verify their Firebase Auth email before protected app access works.

## Add A Student

1. Ask the student to open the app and choose **Sign up**.
2. They must select **Student**.
3. They must use a `@btech.christuniversity.in` email address.
4. They complete the student fields and submit.
5. They verify the email link sent by Firebase.
6. After verification, they can sign in and use the student dashboard.

No admin approval is needed for student accounts.

## Add A Faculty Reviewer

1. Ask the faculty member to open the app and choose **Sign up**.
2. They must select **Faculty**.
3. They must use a `@christuniversity.in` email address, not a student subdomain.
4. They verify the email link sent by Firebase.
5. They sign in once after verification so the backend records the verified state.
6. An admin signs in and opens **Admin Console**.
7. The admin opens **Faculty Access** and approves the pending request.

Until approval, the faculty user sees a pending-approval screen and cannot review bookings or manage machines.

## Add The First Admin

The first admin is created through the deployment environment variable `BOOTSTRAP_ADMIN_EMAILS`.

1. In Vercel, open the `lab-dashboard` project.
2. Add the verified admin email to `BOOTSTRAP_ADMIN_EMAILS`.
3. Use comma-separated emails for more than one bootstrap admin.
4. Redeploy the app after changing the environment variable.
5. Create/sign in with that Firebase Auth account and verify the email.
6. Sign in once after verification.
7. When that verified email calls the trusted API, the backend normalizes its profile to active admin.

Example:

```text
BOOTSTRAP_ADMIN_EMAILS=<primary-admin-email>,<secondary-admin-email>
```

Keep this list small. It is a production privilege boundary.

## Add Another Admin After Launch

Preferred method:

1. Add the new admin email to `BOOTSTRAP_ADMIN_EMAILS`.
2. Redeploy.
3. Have the new admin sign up/sign in and verify their email.
4. Have them sign in once after verification.
5. Confirm they can access **Admin Console**.

Emergency/manual method:

1. In Firebase Console, find the verified user in Authentication and copy their UID.
2. In Firestore, open `profiles/{uid}`.
3. Set:
   - `role`: `admin`
   - `requested_role`: `admin`
   - `status`: `active`
   - `approved_by`: existing admin UID or `manual`
   - `approved_at`: current ISO timestamp
   - `suspended_at`: `null`
4. Save and ask the user to sign out and sign in again.

Use the manual method sparingly and record the change in lab operations notes.

## Suspend Or Remove Access

The current UI does not yet include a full user suspension screen.

For urgent access removal:

1. Disable the user in Firebase Authentication.
2. Set `profiles/{uid}.status` to `suspended` in Firestore.
3. If the user is an admin, remove them from `BOOTSTRAP_ADMIN_EMAILS` and redeploy.

Do not delete profiles casually; bookings and audit history depend on stable user IDs.

## Machine Access

Faculty and admins can manage machines from **Operations** or **Admin Console**.

- Machines with historical bookings are deactivated instead of hard-deleted.
- Students only see active machines.
- Image URLs must use HTTPS.
- Training requirements and specifications should be kept accurate because students rely on this information before booking.
- Machines marked as training-required cannot be booked by a student until a faculty/admin creates an active training approval.
