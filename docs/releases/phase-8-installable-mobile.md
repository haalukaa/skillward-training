# Phase 8 — installable mobile experience

Release marker: `20260825-phase8-mobile-pwa-1`

## Delivered

- Installable web app manifest with SkillWard icons, standalone presentation, shortcuts and iOS metadata.
- Root-scoped service worker with an intentionally small, non-sensitive cache.
- Offline reconnect page. Organisation, competency, evidence, authentication and runtime configuration are never cached for offline use.
- Visible offline state, user-controlled update prompt and install guidance for supported browsers and iOS.
- Push-notification-ready browser boundary. Permission and subscription are never requested without a user action and configured application server key.
- Safe browser persistence: authenticated use retains only the selected organisation identifier and workspace view; organisation records and report, competency or evidence data are not written to application state storage.
- Deep links for authorised work and security destinations.
- Safe-area handling, standalone layout and accessible touch targets.
- Browser verification at 360×800, 390×844, 430×932 and 768×1024, plus the existing desktop suite.

## Deliberate boundaries

- Offline mode does not expose authenticated records or allow writes.
- Push delivery is prepared but not enabled until a notification provider, VAPID keys, consent copy and server-side subscription storage are approved.
- This is an installable PWA. It is not represented as available in the Apple App Store or Google Play. Native wrappers, signing, store privacy declarations and store review remain future work.

## Release verification

1. Run JavaScript, build, database-static and secret checks.
2. Run clean local Supabase migrations, seed and every pgTAP assertion.
3. Verify service-worker registration, cache contents and offline fallback in Chromium.
4. Verify desktop and exact 390×844 application journeys.
5. Deploy only the protected `main` artifact and run production browser smoke against the Phase 8 release marker.
