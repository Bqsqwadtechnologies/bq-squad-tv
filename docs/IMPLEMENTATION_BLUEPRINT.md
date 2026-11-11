# BQ SQWAD TV — Repository Implementation Blueprint

**Repository:** `Bqsqwadtechnologies/bq-squad-tv`  
**Target branch:** `main`  
**Audit basis:** Read-only GitHub inspection of the current main tree.  
**Status:** Repository mapped; implementation work proceeds in small verified slices.

This document maps the approved master specification to the current repository. It is intentionally factual: a route file or client screen is not proof of a deployed backend integration.

## 1. Confirmed repository baseline

### Root and website
- `src/routes/index.tsx`: current public landing page; preserve its existing content and branding while adding future product routes.
- `src/routes/__root.tsx`, `src/router.tsx`, `src/server.ts`: TanStack Start application shell/server entry.
- `src/routeTree.gen.ts`: generated file; never edit manually.
- `src/lib/server/`: existing server-side Firebase, auth, roles, channel access, audit, pricing, ledger and API helpers.
- `src/routes/api/public/v1/`: existing API route tree.
- `docs/`: API, billing, streaming, secrets and phase architecture documents already exist.
- `firestore.rules`: currently a default-deny rule set. Keep client access denied unless a narrowly scoped, reviewed rule is required; privileged operations remain server-side.
- `.github/workflows/backend-ci.yml`: existing CI covers Bun install, TypeScript, lint, Vitest, website build, secret scan and a Cloudflare-reference guard. Harden it; do not replace it.
- `package.json`: Bun scripts include `test`, `lint` and `build`.

### Existing API routes found in the current tree
- `POST /api/public/v1/profile/complete`
- `GET /api/public/v1/catalog/home`
- `GET /api/public/v1/catalog/search`
- `GET /api/public/v1/channels/{channelId}`
- `GET /api/public/v1/security/integrity/challenge`
- `GET /api/public/v1/wallet`
- `GET /api/public/v1/wallet/ledger`
- `POST /api/public/v1/sessions/{sessionId}/heartbeat`
- `POST /api/public/v1/sessions/{sessionId}/end`
- `GET /api/public/firebase-schema-inspect` (restricted schema inspector)

**Not found in the inspected route tree:** session start; Paystack initialize/verify/webhook; Google Play product/verification routes; ad routes; push-token route; producer summary; movie/match/content asset routes; producer/organization onboarding; licensing and rights-holder routes; payout routes; device management routes; provider playback authorization routes.

The current route tree is partial: the listed files exist in Git, but production deployment and external credential configuration must be verified separately.

### Existing backend helpers
- `src/lib/server/firebase-admin.ts`: Web Crypto service-account OAuth and Firestore REST client with get/query/commit/transaction helpers.
- `src/lib/server/firebase-auth.ts`: Firebase ID-token verification.
- `src/lib/server/api.ts`: common auth, Zod body parsing, error handling, profile/age and wallet reads.
- `src/lib/server/roles.ts`: viewer/producer/admin and admin module scopes; super-admin anchored to verified `ADMIN_EMAIL`.
- `src/lib/server/channel-access.ts`: channel roles and delegated permissions.
- `src/lib/server/audit.ts`: audit log writer.
- `src/lib/server/pricing.ts`: versioned platform pricing configuration and integer minor-unit validation.
- `src/lib/server/ledger.ts`: ledger cursor helpers.
- `src/lib/server/rate-limit.ts`: rate-limiting helper.
- `src/lib/server/parental-pin.ts`: parental PIN helpers.

### Existing tests
- Channel access and role tests.
- Session metering tests.
- Wallet ledger and Firestore helper tests.
- Parental PIN and schema authorization tests.
- Website route smoke test.

### Android
- Native Android app lives under `android/`; package is `com.bqsqwad.tv`.
- Existing Android setup, secrets and build configuration are present.
- The existing API contract and Media3 foundation must be preserved.
- Before changing Kotlin sources, map the actual package tree and existing Retrofit/service/player implementations; do not assume a new client architecture.

## 2. Audit findings that affect implementation order

1. The current API contract in `docs/API.md` is not identical to the approved PAYG movie/match model; it is channel-oriented and must be evolved compatibly.
2. A session start route was not found, while heartbeat and end routes already exist. Implement start before enabling client playback.
3. Current session helpers calculate a cumulative rounded amount in minor units. The approved specification requires exact carry across heartbeat intervals and one final settlement rounding rule. Reconcile this before expanding billing.
4. Existing heartbeat logic derives elapsed time from server timestamps and uses a client sequence number, but the current shape does not provide a complete trusted playing/buffering/paused telemetry contract. Do not claim paused/buffering intervals are excluded until this is implemented and tested.
5. Existing heartbeat/end handlers allocate producer/platform shares during session charging. The approved architecture requires a price/share snapshot and reconciled settled revenue allocation; migrate carefully to avoid double-crediting existing producer balances.
6. Existing roles and channel permissions are a foundation, not the complete organization, rights-reviewer and support-agent model. Extend without weakening the super-admin and channel-owner protections.
7. Existing `firestore.rules` default-deny all client reads/writes. Do not loosen it broadly. Any new client-readable catalog/profile surface requires a least-privilege rule review; sensitive writes remain server-only.
8. Existing documentation states some backend routes and provider integrations are planned rather than deployed. Keep that distinction in UI and release notes.
9. The Google Play service-account credential is a known external dependency. Do not fabricate it or mark Play verification complete without a successful sandbox/production check.
10. The streaming provider has not been selected. Provider abstraction and test doubles can be implemented first; real provider integration waits for contract, rights and credential approval.

## 3. Target code layout

Add new server modules under `src/lib/server/` as the implementation requires:

- `content-access.ts`: publication, license, territory, platform, age and schedule access decisions.
- `license-workflow.ts`: license states, evidence requirements and review transitions.
- `streaming/contract.ts`: provider adapter types and normalized playback result.
- `streaming/registry.ts`: configured provider lookup; no hard-coded provider credentials.
- `streaming/source-encryption.ts`: authenticated encryption for private source URLs, key versioning and safe decrypt access.
- `streaming/bq-hosted.ts`: BQ-owned asset delivery adapter (only after storage/transcode/CDN provider is selected).
- `billing/money.ts`: exact integer/rational money arithmetic and documented settlement rounding.
- `billing/session-metering.ts`: trusted interval validation, price snapshots and reconciliation.
- `billing/revenue-allocation.ts`: contract-version allocation from settled net revenue.
- `devices/limits.ts`: simultaneous playback enforcement and revocation.
- `producer/verification.ts`: individual and organization onboarding rules.
- `payouts/monthly.ts`: idempotent monthly statement and payout-batch preparation.
- `audit-sensitive-access.ts`: privileged URL reveal and rights override audit wrappers.

Keep modules small and testable. Use existing Firebase/Firestore abstractions unless a verified limitation requires a compatible extension.

### Target API route families
Retain `/api/public/v1` and add route files in the existing TanStack route convention:

- `sessions/start.ts` (required before playback)
- `movies/index.ts`, `movies/$movieId.ts`, content submit/publish routes
- `matches/index.ts`, `matches/$matchId.ts`
- `content-assets/upload-init.ts`, upload-complete/status routes
- `licenses/index.ts`, `licenses/$licenseId/submit.ts`, review/verify routes
- `rights-holder/requests.ts`, confirmation and report routes
- `producer/register.ts`, verification, earnings and payout routes
- `organizations/register.ts`, members and verification routes
- `playback/authorize.ts`, revoke and provider callback/webhook routes
- Paystack initialize, verify and webhook routes
- Google Play products and purchase verification routes
- `devices/index.ts`, registration and revoke routes
- admin content, license, pricing, payout, device and audit routes
- support ticket create/list/update routes

Use existing naming conventions and inspect TanStack route generation after additions; never edit `src/routeTree.gen.ts` by hand.

## 4. Phased implementation sequence

### Phase 0 — Baseline and contract reconciliation
- Read the complete route, Android client and test source before editing.
- Run existing TypeScript, lint, Vitest and website build.
- Record current failures separately from introduced failures.
- Reconcile docs/API.md, docs/BILLING.md and docs/STREAMING.md with this master specification.
- Confirm existing Firestore document shapes with the authorized schema inspector; do not write to production data during audit.
- Produce a backwards-compatible migration plan and test fixtures.

**Exit gate:** existing behavior is understood, baseline tests recorded, schema differences documented.

### Phase 1 — Security and domain foundations
- Add exact money arithmetic and property/unit tests.
- Add license/content access decision helpers and state-transition tests.
- Add provider adapter contracts and a fake provider for tests only.
- Add source URL authenticated encryption/decryption helper with key-version metadata and strict server-only access. Configure the key in Lovable Cloud Secrets outside Git; never place a placeholder key in code.
- Add tests proving plaintext URLs are not included in public DTOs or logs.
- Extend roles/organization scope only with tests; preserve current super-admin logic.
- Keep Firestore client rules default-deny until exact read requirements are defined.

**Exit gate:** pure helper tests pass; no real provider or production secrets required.

### Phase 2 — Producer, organization and licensing
- Individual and organization producer applications.
- Organization team membership and least-privilege roles.
- Private document references and admin review queue.
- License evidence, territory/platform/term scope, rights-holder confirmation and audit trail.
- Enforce no self-approval and no publishing before approval.
- Rights-holder report/takedown workflow.

**Exit gate:** unauthorized producers/content cannot publish in API tests.

### Phase 3 — Hybrid provider and content assets
- Implement one provider adapter only after selecting a provider and confirming contract scope.
- Add BQ-hosted ingest/storage/transcoding/CDN adapter only after provider, costs and rights are approved.
- Normalize HLS/DASH playback authorization and revocation.
- Add provider health and cost telemetry.
- Never proxy/record/repackage third-party content without express contractual permission.

**Exit gate:** provider sandbox and BQ-hosted test asset pass signed playback, expiry and revocation tests.

### Phase 4 — PAYG session engine
- Implement session start with price/share snapshots, device and rights checks.
- Rework heartbeat/end for exact accumulation, verified playback intervals and idempotent settlement.
- Reconcile existing producer earnings/ledger semantics before migration.
- Add playback stop/revoke on wallet exhaustion, timeout, rights expiry and device-limit violation.
- Add wallet reservation only if required by the verified settlement model; release unused reserve at end.

**Exit gate:** concurrency, retry, pause, buffer, disconnect, timeout, insufficient balance and rounding tests pass.

### Phase 5 — Payments, earnings and payouts
- Paystack website top-up, verification and signed webhook.
- Google Play product and purchase verification after service account is configured.
- Refund/chargeback handling and immutable compensating ledger entries.
- Contract-based net revenue allocation.
- Monthly statement and idempotent payout batch with holds, retries and reconciliation.

**Exit gate:** provider sandbox tests prove exactly-once credit and payout behavior.

### Phase 6 — Product surfaces
- Viewer web catalog, movie/match details, wallet and web playback.
- Producer Console and Organization Portal.
- Admin Dashboard and Rights Holder Portal.
- Support Centre.
- Android API contract, Media3 player, wallet and producer flows.
- Preserve existing home page and native app identity.

**Exit gate:** web and Android integration tests use the same API contract.

### Phase 7 — Production readiness
- Security review, privacy/legal review, rights audit and threat model.
- Load/performance and video cost tests.
- Restore/key rotation drills.
- Monitoring and incident response.
- Controlled launch with only verified producers and licensed content.

**Exit gate:** all production credentials, rights, provider contracts and operational support are verified.

## 5. First code slice to implement

The first code slice after baseline testing should be domain foundations, not a premature video vendor integration:

1. Exact integer/rational PAYG math with final rounding tests.
2. License/content authorization pure helper.
3. Streaming provider contract and test fake.
4. AES-GCM source URL envelope helper with key-version support.
5. Tests for role isolation, self-approval denial and public URL non-disclosure.

Do not add a real external provider, upload pipeline, DRM vendor, storage bucket or payout provider until the owner has selected the vendor and accepted its costs/contract terms.

## 6. External dependencies and owner decisions

These must remain visible as blockers, not fabricated configuration:
- Google Play service account and Play Console API permission.
- Paystack live/test keys and webhook setup.
- First licensed streaming provider, contract and API credentials.
- BQ-hosted video storage, transcoding and CDN vendor/cost plan.
- Encryption key provisioned in Lovable Cloud Secrets and rotation/recovery plan.
- Rights-holder contracts and actual content licenses.
- Legal approval of producer terms, payout rules, privacy, copyright and refunds.
- Verified payout provider and beneficiary/KYC requirements.

## 7. Commit and verification policy

- Commit directly to `main`, using fast-forward commits only.
- Do not create branches or PRs.
- Never rewrite pushed history.
- Do not edit generated `src/routeTree.gen.ts`.
- Run relevant tests after each code slice and the full existing CI command set before calling a phase complete.
- Report commit SHA, changed files, test commands/results and any unverified external dependency.


## 8. Initial implementation progress (2026-11-11)

Committed directly to `main`:

- `src/lib/server/money.ts`: exact integer-kobo cumulative PAYG calculations, exact micro-kobo accrual representation and cumulative half-up settlement helpers.
- `src/test/money.test.ts`: tests for per-minute calculations, cumulative rounding, heartbeat-boundary invariance and invalid inputs.
- `src/lib/server/content-rights.ts`: fail-closed playback rights gate for publication state, verification, commercial streaming, paid-streaming permission, territory, platform and license term.
- `src/test/content-rights.test.ts`: rights, territory, platform and expiry tests.
- `src/lib/server/streaming/provider.ts`: provider-neutral hybrid streaming adapter contract.
- `src/lib/server/streaming/source-encryption.ts`: server-only AES-256-GCM source URL encryption/decryption primitive with asset-bound associated data and versioned key-ring lookup.
- `src/test/streaming-source-encryption.test.ts`: encryption round-trip, nonce uniqueness, asset binding and invalid URL/key tests.

The existing API/BILLING/STREAMING/SECRETS guides now point to the canonical master spec; the secrets checklist documents the two required encryption-key secret names without including values.

**Integration status:** These are foundational helpers and tests. They are not yet wired into session start, playback authorization, upload submission or the admin URL-reveal route. No real streaming provider, storage/CDN vendor or production encryption key has been configured. Do not accept or publish real source URLs until those integrations and the external secret setup are complete.

**CI status:** GitHub Actions reports the recent `backend-ci.yml` push runs as failed, but the GitHub API currently returns no job records for those runs. Therefore the exact failing step cannot be established from the available run metadata, and no passing build/test result is claimed. Resolve CI observability and run the full TypeScript, lint, Vitest and build suite before marking this code slice verified.


### Playback-evidence metering update (2026-11-11)

- The heartbeat request now carries clientSequence, Media3 playbackState and playbackPositionMs.
- The server bills only when the previous and current samples both report playing, the media position advanced, and the advancement is bounded by server elapsed time (maximum 45 seconds per accepted heartbeat interval).
- Paused, buffering, idle, ended, unchanged-position and stale-heartbeat intervals are not billed.
- Session end does not charge an unconfirmed trailing interval.
- Android player heartbeat calls now send the Media3 state and current media position.
- This is conservative client-player telemetry, not cryptographic proof of playback. Play Integrity token verification and provider-side authorization/telemetry are still required before production playback.
- Website/API build, TypeScript, lint and unit tests passed in the latest observed run before the CI guard update; Android unit tests and Kotlin compilation passed, but the Android ktlint job exposed pre-existing formatting violations in android/app/build.gradle.kts. A later CI run is required after the guard change.


### Play Integrity verification foundation (2026-11-11)

- Added server-side Google Play Integrity token decoding using the dedicated GOOGLE_PLAY_SERVICE_ACCOUNT_JSON and GOOGLE_PLAY_PACKAGE_NAME settings.
- The verifier requires the expected package and one-use nonce, a recent token timestamp, PLAY_RECOGNIZED app verdict, MEETS_DEVICE_INTEGRITY device verdict and LICENSED app licensing verdict.
- Added an atomic Firestore challenge-consumption helper that rejects missing, foreign, expired and previously used challenges.
- Pure tests cover Play Integrity verdict validation and challenge ownership/expiry. These helpers are not yet wired into sessions/start; playback remains unavailable until the route is implemented and the Google Play service account is configured with Play Integrity API access.
