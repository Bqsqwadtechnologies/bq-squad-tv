# BQ SQWAD TV — Lovable backend implementation handoff

This document is an implementation handoff for the existing BQ SQWAD TV project. It is not evidence that backend functions, Firestore rules, payment processing, or deployment already exist.

## Repository constraints

- Repository: `Bqsqwadtechnologies/bq-squad-tv`
- Branch: `main`
- Website: existing TanStack Start + React application at the repository root.
- Android: existing Kotlin/Jetpack Compose application under `android/`.
- Android application ID: `com.bqsqwad.tv`.
- Preserve the existing application screens, branding, package ID, build setup, and current product identifiers.
- Do not use Cloudflare Workers or change the current website hosting target without explicit approval.
- Do not migrate the data layer to Supabase or create a second database.
- Follow `AGENTS.md`: Lovable-managed database changes and secrets must be handled through the Lovable project; do not commit secret values or manually bypass managed database configuration.

## Existing contracts to preserve

Read these repository documents before implementation:

- `docs/API.md` — Android API contract, including profile/age policy, catalogue, integrity, playback sessions, wallet, Google Play, ads, push tokens, and producer summary.
- `docs/BILLING.md` — server authority for wallet, playback metering, payment verification, refunds, ledger and revenue splits.
- `docs/STREAMING.md` — player/provider requirements and restrictions.
- `docs/PHASE_1_ARCHITECTURE.md` — shared website/Android architecture.
- `docs/SECRETS_CHECKLIST.md` — credential setup.

These documents describe requirements; they do not prove the services are deployed.

## Required implementation

### A. Inspect before changing data

1. Inspect the connected Firebase project and its existing Firestore collections, documents, indexes, Authentication providers, and current security rules.
2. Export or document the existing schema before proposing changes.
3. Reuse existing collections and fields wherever possible. Do not create duplicate user, wallet, payment, catalogue, producer, or session collections.
4. If any requested change conflicts with existing production data, stop and report the exact conflict rather than overwriting or migrating data silently.

### B. Backend runtime and security

1. Use the existing Lovable-managed backend/runtime for this project, with Firebase Admin SDK access to the existing Firebase project where supported and configured.
2. Keep all privileged operations server-side. Do not put Admin credentials, Paystack secret keys, Google Play service-account JSON, or streaming-provider secrets in browser code or the Android APK.
3. Verify Firebase ID tokens on every protected request.
4. Resolve roles and account status from trusted server-side records or verified custom claims; never accept role, age, balance, price, revenue share, or entitlement values from a client.
5. Apply strict request schemas, payload limits, rate limits, structured errors, audit records, and idempotency.
6. Default-deny direct client writes to wallet balances, ledger, payments, purchase verification, playback settlement, producer earnings, payouts, roles, and administrative configuration.
7. Add and test indexes required by real queries. Do not guess collection names or field paths.

### C. Required API routes

Implement the routes in `docs/API.md` and preserve their response shapes. At minimum:

- `POST /v1/profile/complete`
- `GET /v1/catalog/home`
- `GET /v1/catalog/search`
- `GET /v1/channels/{channelId}`
- `GET /v1/security/integrity/challenge`
- `POST /v1/sessions/start`
- `POST /v1/sessions/{sessionId}/heartbeat`
- `POST /v1/sessions/{sessionId}/end`
- `GET /v1/wallet`
- `GET /v1/wallet/ledger`
- `GET /v1/wallet/google-play/products`
- `POST /v1/wallet/google-play/verify`
- `GET /v1/ads/next`
- `POST /v1/ads/{adId}/events`
- `POST /v1/devices/push-token`
- `GET /v1/producer/mobile-summary`

Also implement the website-specific Paystack initialize, verify, and signed-webhook endpoints. Use the existing API contract and Android repository interfaces as the source of truth; do not introduce incompatible route names.

### D. Payments and wallet

- Website checkout uses Paystack only.
- Android digital purchases use Google Play Billing only.
- Verify Paystack transactions with Paystack from the server before crediting.
- Verify Google Play purchase tokens with the Google Play Developer API before crediting.
- Validate amount, currency, product, package, purchase state, quantity, ownership, refunds/revocations, and transaction references.
- Make webhooks and purchase verification idempotent.
- Use Firestore transactions or another supported atomic mechanism for balance + ledger changes.
- Never accept a client-supplied balance, amount-to-credit, or successful-payment flag.
- Do not activate Google Play verification until the correct Play service-account credential is configured. A Firebase service account is not automatically a Play Developer API credential.

### E. Playback, age and rights

- Calculate age eligibility on the server from the stored date of birth. Apply the repository's under-18 content restrictions consistently.
- Check channel publication status, territory, licensing/rights, account status, wallet eligibility, concurrent sessions, and integrity requirements before issuing playback.
- Sign playback URLs with short expiry and never return raw provider secrets.
- Meter elapsed time using server timestamps, not client clocks.
- Make heartbeat and end-session settlement atomic and idempotent.
- Do not publish invented channels or unauthorized streams. If no licensed provider and valid stream are configured, return an explicit unavailable/configuration state.

### F. Website and Android integration

1. Inspect existing website routes, Firebase Auth setup, Android repositories, Retrofit/API clients, and dependency injection before editing.
2. Connect both clients to the same backend base URL and authentication authority.
3. Preserve the existing API field names and response models.
4. Make errors, missing configuration, empty catalogue, expired sessions, and unavailable streams explicit in the UI.
5. Do not let either client directly mutate protected financial or authorization records.

### G. Secrets

Inspect secret *names and presence only*. Never print, log, copy into source, or expose secret values.

Expected server-side credentials, when applicable:

- Firebase Admin service account JSON for the existing Firebase project.
- Paystack secret key and webhook verification configuration.
- Google Play Developer API service-account JSON (separate from Firebase Admin).
- Streaming-provider credentials and signing keys.

Do not assume a secret exists because a similarly named secret exists. Report missing credentials without blocking safe code work.

## Verification and completion gate

Run backend unit/integration tests, Firestore rules tests, website lint/build/tests, and Android compile/tests where the environment supports them. Do not claim a test passed unless it was run and its output was checked.

Before calling the work complete, provide:

1. Files created and modified.
2. Existing Firestore collections reused and any new collections approved.
3. Rules and indexes actually deployed.
4. API routes actually implemented and deployed.
5. Website and Android integration status.
6. Paystack and Google Play verification status.
7. Secret names missing (never values).
8. Test commands and actual pass/fail output.
9. Deployment URL, runtime, and deployment confirmation.
10. Explicit blockers and remaining manual steps.

**Do not stop after generating a plan. Implement, test, and deploy the parts supported by the connected project. Clearly label anything blocked by unavailable credentials, missing licensing, or platform permissions.**