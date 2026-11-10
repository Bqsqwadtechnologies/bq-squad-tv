# BQ SQWAD TV — Lovable backend implementation handoff

This document is an implementation handoff for the existing BQ SQWAD TV project. It is not evidence that backend functions, Firestore rules, payment processing, or deployment already exist.

## Repository constraints

- Repository: `Bqsqwadtechnologies/bq-squad-tv`
- Branch: `main`
- Website and shared API are hosted on Lovable; Android application ID: `com.bqsqwad.tv`.
- Preserve the existing application screens, branding, package ID and build setup.
- **Do not introduce or use any Cloudflare product or configuration**: Workers, Pages, R2, KV, D1, Durable Objects, Stream, Images, Turnstile, Cloudflare DNS/CDN/WAF, Wrangler, or `@cloudflare/*`.
- Keep the Lovable-managed Vite/TanStack preset and Nitro settings untouched. Do not change `vite.config.ts` to work around its managed defaults; raise a hosting-runtime decision for the owner instead.
- Do not migrate the data layer to Supabase or create a second database.
- Follow `AGENTS.md`: do not rewrite published history, edit generated files, or commit secret values.

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

1. Inspect the existing Firebase project configuration and existing Firestore collections, indexes, Authentication providers and security rules before any production data change.
2. Reuse existing collections and fields wherever possible. Do not create duplicate user, wallet, payment, catalogue, producer or session collections.
3. If a requested change conflicts with production data, stop and report the exact conflict rather than overwriting or migrating data silently.

### B. Backend runtime and security

1. Use the existing Lovable-hosted backend/runtime with Firebase Admin REST access to the existing Firebase project where configured.
2. Keep privileged operations server-side. Never put Admin credentials, Paystack secret keys, Google Play service-account JSON or streaming-provider secrets in browser code or the Android APK.
3. Verify Firebase ID tokens on every protected request.
4. Resolve roles and channel permissions from trusted server-side records; never accept role, age, balance, price, revenue share or entitlement values from a client.
5. Apply strict request schemas, payload limits, rate limits, structured errors, audit records and idempotency.
6. Default-deny direct client writes to wallet balances, ledger, payments, purchase verification, playback settlement, producer earnings, payouts, roles and administrative configuration.
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

Also implement website-specific Paystack initialize, verify and signed-webhook endpoints. Preserve the documented contracts.

### D. Payments and wallet

- Website checkout uses Paystack only.
- Android digital purchases use Google Play Billing only.
- Verify Paystack transactions and Google Play purchase tokens from the server before crediting.
- Validate amount, currency, product, package, purchase state, quantity, ownership, refunds/revocations and transaction references.
- Make webhooks and purchase verification idempotent.
- Use Firestore transactions for balance + ledger changes.
- Never accept a client-supplied balance, amount-to-credit or successful-payment flag.
- Do not activate Google Play verification until the correct Play service-account credential is configured. A Firebase service account is not automatically a Play Developer API credential.

### E. Playback, age and rights

- Calculate age eligibility on the server from stored date of birth and apply under-18 restrictions consistently.
- Check channel publication status, territory, licensing/rights, account status, wallet eligibility, concurrent sessions and integrity requirements before issuing playback.
- Sign playback URLs with short expiry and never return raw provider secrets.
- Meter elapsed time using server timestamps, not client clocks.
- Make heartbeat and end-session settlement atomic and idempotent.
- Do not publish invented channels or unauthorized streams. If no licensed provider and valid stream are configured, return an explicit unavailable/configuration state.

### F. Media provider

- Implement a provider-neutral `StreamProvider` interface.
- Default implementation target is the existing Google Cloud project: Cloud Storage plus Transcoder API producing HLS.
- Keep storage/transcoding credentials server-side and issue short-lived signed upload/playback URLs.
- No Cloudflare product may implement or host any part of the media adapter.
- Copyright fingerprinting remains an interface until the owner selects a vendor.

### G. Secrets

Inspect secret *names and presence only*. Never print, log, copy into source or expose secret values.

Expected server-side secret names, when applicable:

- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `ADMIN_EMAIL`
- `PAYSTACK_SECRET_KEY`
- `PAYSTACK_PUBLIC_KEY`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- `GOOGLE_PLAY_PACKAGE_NAME`

Do not assume a secret exists because a similarly named secret exists. Report missing credentials without blocking safe code work.

## Verification and completion gate

Run backend unit/integration tests, Firestore rules tests, website lint/build/tests and Android compile/tests where the environment supports them. Do not claim a test passed unless it was run and its output was checked.

Before calling the work complete, provide:

1. Files created and modified.
2. Existing Firestore collections reused and any new collections approved.
3. Rules and indexes actually written versus deployed.
4. API routes actually implemented and deployed.
5. Website and Android integration status.
6. Paystack and Google Play verification status.
7. Secret names missing (never values).
8. Test commands and actual pass/fail output.
9. Deployment URL, runtime and deployment confirmation.
10. Explicit blockers and owner decisions.

**Do not stop after generating a plan. Implement and verify the parts supported by the connected project. Clearly label anything blocked by unavailable credentials, missing licensing or platform permissions.**
