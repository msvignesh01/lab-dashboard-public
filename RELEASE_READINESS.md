# Release Readiness

This product is production-intended, but each release must pass operational sign-off before it is treated as production.

## Why A Passing Build Is Not Enough

The codebase can pass local validation while still not being production-signed-off if any of these are unfinished:

- Vercel preview deployment has not been tested manually.
- Firebase preview or production environment variables are missing.
- Firestore rules and indexes have not been deployed to the target Firebase project.
- Firestore rules emulator tests have not run in an environment with Java.
- The hardening migration has not been dry-run and reviewed.
- Bootstrap admin access has not been configured through environment/Firebase state.
- Student, faculty, and admin real-account flows have not been tested end to end.

## Branch Preview Flow

1. Create a hardening branch.
2. Run:

```bash
npm ci
npm run lint
npm test
npm run build
npm run vercel-build
npm audit --omit=dev
```

3. Run `npm run test:rules` in an environment with Java.
4. Push the branch to GitHub.
5. Create a Vercel preview deployment from that branch.
6. Configure Vercel preview env vars for the intended Firebase test project.
7. Run the manual QA checklist against the preview URL.

If the Vercel project has Deployment Protection enabled, branch preview URLs may show Vercel Authentication before the app. Testers should either sign in with an authorized Vercel account or use a deliberately created temporary bypass/shareable link. Do not paste bypass secrets into source, docs, tickets, or screenshots, and revoke temporary bypass access after testing.

## Firebase Test Project Flow

Use a separate Firebase project for manual branch testing whenever possible.

Current aliases:

- `production`: `lab-dashboard-2809`
- `preview`: `aml-lab-dash-test-2809`

Required setup:

- Enable Firebase Authentication Email/Password.
- Create Firestore in Native mode.
- Deploy Firestore rules and indexes from this repo.
- Add Firebase web app config to Vercel preview env vars.
- Add Firebase Admin SDK env vars to Vercel preview env vars.
- Add bootstrap admin emails only as secret environment configuration.

Do not commit real privileged emails, service account keys, private keys, or provider credentials.

## Production Promotion Flow

1. Confirm preview QA passes.
2. Confirm the target production Firebase project and Vercel project.
3. Deploy Firestore rules and indexes only after approval.
4. Run migration dry-run and review the masked report.
5. Run migration apply only after approval.
6. Promote or redeploy the tested Vercel build.
7. Verify real student, faculty, and admin flows.
8. Record the final deployment URL, commit SHA, Firebase project, tester, date, and known risks in the QA checklist.
