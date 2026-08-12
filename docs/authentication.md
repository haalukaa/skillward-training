# Authentication and GitHub Pages deployment

## Architecture

The official `@supabase/supabase-js` package is bundled at build time. `src/supabase-client.js` owns browser client creation, `src/auth-service.js` owns Auth/session lifecycle and trusted-context construction, and `src/database-service.js` performs RLS-protected reads. The interface never calls sign-up or Admin Auth. It derives workplace role, account status, active hospital membership, permitted departments, trainer relationships, and pathway assignments from database responses. RLS—not the browser or publishable key—is the authorization boundary.

Demo Mode is explicitly separate. It retains the sample role selector and browser storage used by the existing demonstration, signs out any real session before entry, and never calls a database mutation. Authenticated access does not consume local-storage roles or departments. Initial authenticated dashboards are read-only; demo Management mutations remain sample-only.

## Configuration and deployment

Repository secrets required (names only): `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The Pages workflow tests, builds, validates both values without printing them, and writes them only to `dist/runtime-config.js` in the temporary artifact. It deploys only reviewed `main`, retaining `https://haalukaa.github.io/skillward-training/`. The checked-in runtime file is intentionally empty.

The anon/publishable key identifies the Supabase project and is necessarily delivered to browsers. It grants no trusted role; RLS evaluates the authenticated user for every request. A service-role key bypasses RLS and **must never** enter frontend code, a Pages secret used by browser builds, logs, or artifacts.

Add these exact URLs manually in Supabase Auth before testing; this pull request does not assume the dashboard is configured:

- Site URL: `https://haalukaa.github.io/skillward-training/`
- Password recovery redirect: `https://haalukaa.github.io/skillward-training/?recovery=1`
- Local development redirect: `http://localhost:8080/?recovery=1`

For local development, run `npm install`, `npm run build`, then serve `dist` at port 8080. Populate browser configuration locally only through an ignored/generated `dist/runtime-config.js`; never commit values.

## Routing and account states

Hospital Administrators receive hospital-wide Management routing. Department Managers with one assigned department open it directly; multiple assignments produce a permitted-only selector. PCA and Cleaner accounts require an assigned department and cannot switch. Trainer roles receive a permitted-only selector when necessary and only RLS-visible compatible trainee relationships. Suspended, archived, invited/incomplete, missing-profile, missing-membership, no-department, expired-session, network, configuration, and RLS failures produce non-diagnostic messages; incomplete contexts are signed out rather than falling back to Demo roles.

Password reset always gives the same neutral response regardless of whether an email exists. Recovery sessions require a matching password of at least 12 characters with upper-case, lower-case, and numeric characters; success signs out and returns to sign-in.

## Invitations and troubleshooting

`InvitationService` is a typed boundary that currently returns a truthful development-only unavailable response. Actual sending requires a separately deployed authenticated Edge Function which verifies an active Management membership, validates role/department scope, invokes Admin Auth server-side, creates invitation records transactionally, rate-limits requests, and emits immutable audit records. No service-role credential belongs in this static application.

If sign-in reports configuration unavailable, check the two repository secret names and Pages workflow. Generic account-configuration errors usually mean the profile or active membership is absent. A no-department state means the database assignment is missing. Generic read errors can indicate connectivity or an RLS denial; inspect Supabase server logs with authorized development access rather than exposing SQL, identifiers, policies, or stack traces in the UI.

## Remaining production requirements

This remains a development integration. Real hospital use additionally requires protected server-side staff invitations; Management MFA; email-provider configuration; production recovery testing; secure privileged Management mutations; backup and disaster-recovery configuration; monitoring, alerting and rate limiting; privacy and security review; penetration testing; hospital governance approval; and an appropriate Supabase production plan and contractual review.
