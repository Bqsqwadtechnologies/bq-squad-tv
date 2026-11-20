# Project Decisions

- 2026-11-17 — Adopt V2 prompt set 00–09 as the current implementation order; it supersedes earlier prompt sets while preserving existing working systems.
- 2026-11-17 — Keep Firebase Authentication and Firestore as the only identity and application database; do not introduce another database or Cloudflare services.
- 2026-11-17 — Preserve the existing Modal video worker, `videoTranscodeJobs` queue, worker API, storage registry, reservations, routing, egress controls, HLS format, wallet, ledger, sessions and payment implementation; improve in place only when the relevant batch explicitly requires it.
- 2026-11-17 — Work directly on `main`, preserve commit history, never edit generated `routeTree.gen.ts`, and never commit credentials.
- 2026-11-17 — Use free existing allowances for all services except the already-authorised video-processing compute; keep optional fee-bearing integrations disabled by default.
- 2026-11-17 — Public contact address is `tv@bqsqwad.com`; keep owner dashboard naming private to the signed-in owner interface.
- 2026-11-17 — When a required setting or credential is absent, ship the feature disabled behind a safe flag and document the exact owner action rather than exposing credentials or blocking unrelated work.

- 2026-11-17 — Brand UI direction is blue and white, following the supplied BQ SQWAD TV logo; do not use purple-and-gold styling. Default website and Android presentation is the white/light surface with blue and cyan accents; dark mode may remain an explicit user choice.

- 2026-11-17 — Keep owner and producer consoles protected by authenticated server-side authorization; crawler exclusions and noindex metadata are only discovery controls. Do not rely on random secret URLs as an access-control mechanism. Preserve existing producer functionality unless the owner explicitly changes scope.
- 2026-11-17 — Public channel search and channel details must use the existing authenticated catalogue endpoints so publication, account and age-eligibility filters remain server-enforced. Do not duplicate catalogue filtering in the browser.

- 2026-11-17 — The Zillionaire dashboard is the single top-level control centre. `ZILLIONAIRE_EMAIL` is its sole configured owner identity. Do not create a second top-level identity or label any person with an administrator title in product UI.

- 2026-11-17 — Playback is online-only. Do not add offline download tabs, buttons, settings or client functionality unless a later owner decision explicitly changes the delivery model. Keep producer features and producer access code intact.
- 2026-11-17 — Product UI must not assign people or accounts the labels “Admin” or “Super Admin”. The Zillionaire Dashboard is the product control centre; individual access is granted only through explicit delegated module permissions.

## Storage Fabric — File 03

- The compact storage pool is sharded by purpose with no more than 200 destination entries per shard. Upload selection reads the purpose shards and the selected shared-account summary; it does not scan all destination documents.
- Shared Lovable-project quota is represented by one `accountGroup`. The conservative initial storage cap is 4.5 GB for that group until the owner supplies a verified larger quota; the monthly data-transfer budget defaults to 9 GB for the group.
- Per-destination reservations, shared-account capacity, the per-purpose routing cursor and the matching pool-shard entry are changed in one Firestore transaction.
- A provider listing is required before automatic assignment. Manual owner-attested usage remains visible but does not qualify a destination for new automatic grants.
- Paid egress remains disabled. B2 free-transfer budget starts blocked until a measured usage reconciliation establishes the conservative budget.

## Console Security, Isolation and Accessibility — Consoles and Providers

- Role boundary enforcement: Server-side authorization distinguishes `/admin` (Zillionaire Owner and delegated admin module scopes), `/producer` (approved producer verification + active plan), and `/provider` (licensed provider representative with active `providerUsers` binding). Each role is strictly barred from accessing another role's endpoints.
- Provider data isolation: Provider accounts receive access only to resources (live channels, statements, contracts, dispute threads) where `providerId` strictly matches their active association. Any cross-provider query or mutation throws `PROVIDER_ISOLATION_VIOLATION` (403).
- Dispute threads: Dispute threads are bidirectional and support operator replies via `/api/public/v1/zillionaire/support/messages` and provider replies via `/api/public/v1/provider/disputes`. Thread isolation prevents any other provider from reading or appending to foreign dispute threads.
- Accessibility & navigation: All three consoles (Zillionaire Dashboard, Producer Console, Partner Portal) implement visible focus indicators (`focus-visible:ring-2 focus-visible:ring-cyan-400`), keyboard navigation (tabIndex, form submission, enter key handling), and explicit accessible labels (`aria-label`, `role="region"`, `role="status"`).

## Automatic Checks & Role Isolation CI — File 01, Batch 01

- 2026-11-18 — Automatic checks enabled on push to and via . Concurrency cancels obsolete runs, actions are pinned to immutable commit SHAs, and jobs independently isolate , , , , , , and . Manual workflows remain preserved.
- 2026-11-18 — Decisions superseding earlier orders (File 00):
  1. Automatic checks are now on. The owner asked for the role-isolation and workflow suites to run on every change and block on failure. Because there are no pull requests, add a workflow that runs on every push to (and on pull requests if one is ever opened), with path filters, concurrency that cancels older runs, and a failing run reported on the commit. Keep the old manual workflows as they are.
  2. The role named "admin" is replaced by Zillionaire in code, data and tests (file 01).
  3. Bottom navigation follows the uploaded design: Home, Live TV, Library, Downloads, Settings. Downloads has no download function: it opens a well-designed "Coming soon" screen (viewing stays online only). The profile avatar sits top right on every screen.
  4. Dark navy and black is the normal theme; white is the second theme. Default is dark.
  5. Per-minute billing is completed and extended to live channels (file 04).

## Batch 03: Zillionaire Identity and Migration

- **Zillionaire Terminology**: Renamed administrative permission model and types to Zillionaire identity (`ZillionaireModule`, `zillionaireModules`, `requireZillionaireModule`, `isZillionaireOwner`).
- **Owner Protection**: Hardened `assertNotProtectedZillionaire` invariant to guarantee that the primary Zillionaire owner (`ZILLIONAIRE_EMAIL`) cannot be demoted, suspended, or deleted under any circumstance.
- **Migration & Backward Compatibility**:
  - Maintained backward-compatible aliases (`AdminModule`, `requireZillionaireModule`, `ADMIN_MODULES`) across the codebase.
  - Read path in `resolvePlatformAccess` supports both `zillionaireModules` and legacy `adminModules` with automated logging.
  - Created idempotent owner migration endpoint `POST /api/public/v1/zillionaire/migration/zillionaire` with tamper-evident audit trail.
  - Removed legacy `ADMIN_EMAIL` fallback in favor of strictly enforced `ZILLIONAIRE_EMAIL`.

## Batch 04: Central Access Library

- **Consolidated Access Architecture**: Created `src/lib/server/access.ts` defining central resolvers:
  - `requireViewer(req)`: Authenticated viewer token, active account status, unrevoked session.
  - `requireZillionaire(req, module?)`: Primary owner or delegated module member with audited module check.
  - `requireProducer(req)`: Verified producer role with active subscription and KYC status.
  - `requireProvider(req, providerId?)`: Verified provider representative scoped to licensed provider organisation.
  - `requireWorker(req)`: Cryptographically verified Modal/background worker signature.
  - `requireChannelPermission(req, channelId, permission?)`: Unified channel gate reconciling public status, producer ownership/team delegation, provider licensing, and Zillionaire channels operators.
- **Context Payloads**: All functions return the resolved entity (`user`, `access`, `fs`, `producerUid`, `providerId`, `workerId`, `role`, `permissions`) to eliminate redundant Firestore queries.

## Batch 05: Producer Isolation and Channel Security

- **Producer Enforcements**:
  - Verification & Subscription Gate: Verified plan status (`ACTIVE`) and approved verification (`APPROVED`) are strictly checked before role activation.
  - Channel Scoping: Handlers strictly enforce `ownerUid === user.uid` or active membership in `channels/{channelId}/members/{uid}` with granular role templates.
  - Sensitive Operations: Channel deletion and ownership transfer are strictly reserved for the primary owner (`role === "owner"`).
  - Resource Bounds: Assets, uploads, and ledger records are query-scoped to the producer's UID to prevent cross-producer data exposure.
- **Integration Tests**: Added `src/test/producer-isolation.test.ts` covering subscription states, channel team delegation, and cross-producer isolation.

## 2026-04-18 — File 01 Batch 06: Provider Organization Isolation & Refactored Route Layer

- **Provider Auth & Access:** Migrated all 5 provider API routes (`channels.ts`, `contracts.ts`, `dashboard.ts`, `disputes.ts`, `statements.ts`) to central `requireProvider(request)` from `@/lib/server/access`.
- **Query Hardening:** Replaced legacy/non-existent `fs.listCollection` calls with strict `fs.query` filtered by `providerId` equality to ensure tenant isolation at the Firestore query layer.
- **Dispute & Statement Isolation:** Enforced strict check verifying that requested statements or dispute threads belong to the authenticated caller's `providerId`, returning `403 PROVIDER_ISOLATION_VIOLATION` or `404` without leaking cross-tenant data.
- **Test Suite:** Added `src/test/provider-isolation.test.ts` verifying active provider org resolution, suspended provider rejection, viewer rejection, and cross-provider query and document isolation. All 79 test files (383 tests) pass.

## Batch 07 — Fine-Grained Module Delegation for Zillionaire Operators (File 01)

### Context & Requirements

V3-01 Batch 07 mandates fine-grained module access for Zillionaire operators (`roles`, `finance`, `channels`, `storage`, `catalog`, `support`, `moderation`, `pricing`, `providers`, `producers`, `users`, `ads`, `reports`, `video`, `delivery`, `settings`). The platform must strictly enforce that operators granted one module cannot call endpoints or access resources of another.

### Architecture & Implementation

1. **Module Registry Expansion**: Expanded `ZILLIONAIRE_MODULES` in `src/lib/server/roles.ts` to include `"finance"` and `"catalog"`, alongside all operational modules.
2. **Family Aliasing & Compatibility**:
   - Operator granted `"finance"` receives permission for `"finance"`, `"payments"`, `"payouts"`, and `"wallets"`, but remains strictly isolated from all other modules.
   - Operator granted `"catalog"` receives permission for `"catalog"` and `"content"`, while remaining isolated from other modules.
3. **Strict Disjoint Isolation**:
   - `requireZillionaireModule(fs, user, module)` evaluates `hasModuleAccess(access.zillionaireModules, module)`.
   - Operators with only a single granted module fail access to every other targeted module with HTTP 403 `ZILLIONAIRE_SCOPE_REQUIRED`.
4. **Permissions Endpoint Governance**:
   - `PUT /api/public/v1/zillionaire/users/$uid/permissions` validates all modules against `ZILLIONAIRE_MODULES`.
   - Writes both `zillionaireModules` and `adminModules` simultaneously for zero-downtime backward compatibility.
   - Guarded by protected Zillionaire owner requirement (`OWNER_AUTHORITY_REQUIRED`) and owner account self-protection (`OWNER_ACCOUNT_PROTECTED`).
5. **Comprehensive Automated Verification**:
   - Added `src/test/module-delegation.test.ts` (24 tests) verifying pairwise and matrix isolation across all 16 targeted modules, multi-module configurations, owner bypass, unassigned rejection, and immediate revocation.
   - Total test suite now: 80 test files, 407 tests passing.

## Batch 08 — Server-Checked Console Page Guards & Anti-Probing 404 Parity (File 01)

### Context & Requirements

V3-01 Batch 08 requires server-checked page guards for privileged console entry points (`/admin`, `/producer`, `/provider`). Unauthenticated or unauthorized visitors must see no login forms, no console headers, and no hint that a control surface exists at the URI. The failure mode must match an unknown route's plain 404 "Page not found" screen. No console data or API requests may trigger before the server validates the visitor's role.

### Architecture & Implementation

1. **Server Role Resolution (`/api/public/v1/auth/web/me`)**:
   - Replaced basic user check with central `requireViewer(request)` and platform role resolution.
   - Securely returns `{ uid, email, emailVerified, roles, isOwner, modules, producerPlanActive, providerId }` with `no-store` cache headers.
2. **Unified `ConsolePageGuard` (`src/components/ConsolePageGuard.tsx`)**:
   - Renders a minimal neutral loading shell (`data-testid="console-loading-shell"`) while verifying session via `restoreWebSession()` and server role endpoint.
   - Evaluates caller permissions against target console role (`admin`, `producer`, `provider`) and optional required module.
   - Injects the authenticated session token and account details directly to child consoles upon authorization, eliminating in-console login forms.
3. **Anti-Probing 404 Parity (`NotFoundView`)**:
   - Extracted root 404 presentation to reusable `NotFoundView` (`src/components/NotFoundView.tsx`).
   - Guard renders identical 404 layout, status, and copy ("Page not found", "The page you're looking for doesn't exist or has been moved.") for unauthorized or unauthenticated visits.
   - Console routes retain `noindex, nofollow, noarchive` robots directives.
4. **Data Isolation**:
   - Console root components (`AdminPage`, `ProducerPage`, `ProviderPage`) are wrapped in `ConsolePageGuard`.
   - Data fetching hooks (`/admin/overview`, `/producer/mobile-summary`, `/provider/dashboard`) only mount after `ConsolePageGuard` confirms authorization.
5. **Comprehensive Automated Verification**:
   - Added `src/test/console-page-guards.test.tsx` (19 tests) covering anonymous 404 presentation, viewer denial across consoles, cross-role isolation (producer denied on admin/provider, provider denied on admin/producer, Zillionaire denied on producer/provider unless role assigned), owner & delegated module authorization, and route robots metadata.
   - Test suite now: 81 test files, 426 tests passing.

## Batch 09 — Privacy-Safe Denied-Access Audit Events & Sharded Counters (File 01)

### Context & Requirements

V3-01 Batch 09 requires writing structured privacy-safe audit records (`accessDenials/{id}`) on every authorization failure (cross-role, cross-tenant, missing module, bad worker signature, disabled feature flag). Under no circumstances may raw user emails, display names, bearer tokens, cookies, auth headers, request bodies, query strings, raw database identifiers, signed playback links, or wallet figures be persisted in denial logs. The system must support sharded hourly counters per `(actorHash, routePattern, reasonCode)`, enforce a 90-day retention TTL, and emit immediate security alerts when any single actor exceeds 10 denials in a rolling hour.

### Architecture & Implementation

1. **Privacy-Preserving Hashing & Coarse Attributes (`src/lib/server/access-denials.ts`)**:
   - `actorHash` and `targetHash`: HMAC-SHA256 digests generated with server-side `AUDIT_HASH_KEY`. Raw IDs are never recorded in Firestore denial documents.
   - `routePattern`: Normalized URL path mapping dynamic segments (UUIDs, prefixed IDs like `usr_`, `ch_`, `prov_`, numeric IDs) to canonical route patterns (e.g. `/api/public/v1/content-assets/:assetId/approve`), stripping query parameters, hashes, and request bodies.
   - `networkPrefix`: Truncated to coarse subnets (`/24` for IPv4, `/48` for IPv6) and HMAC-hashed; individual IP addresses are never recorded.
   - `platformClass`: High-level client classification (`web`, `android`, `ios`, `worker`, `unknown`) based on standard client identifiers.
   - Schema enforcement: Strict 13-property whitelist stored in `accessDenials/{id}` with 90-day `expiresAt` TTL.
2. **Sharded Counters & Rate-Based Alerting**:
   - Hourly sharding (`accessDenialCounters/{actorHash}_{patternHash}_{reason}_{hourUtc}_shard{0-4}`) distributes counter writes across 5 shards to prevent write bottlenecks.
   - Central hourly rollup (`accessDenialHourlyTotals/{actorHash}_{hourUtc}`) tracks aggregate denials across all endpoints and triggers a high-severity security alert (`securityAlerts/{actorHash}_{hourUtc}`) as soon as an actor exceeds 10 denials within an hour.
3. **Authorization & Worker Middleware Integration**:
   - `roles.ts`: Integrated into `requirePlatformRole` (403 `FORBIDDEN`), `requireZillionaireModule` (403 `ZILLIONAIRE_SCOPE_REQUIRED`), and `requireProviderAccess` (403 `PROVIDER_ROLE_REQUIRED` and `PROVIDER_ISOLATION_VIOLATION`).
   - `video-worker-auth.ts`: Integrated into `requireVideoWorker` on worker status check (403 `WORKER_DISABLED`) and HMAC signature verification (401 `INVALID_SIGNATURE`).
   - `flags.ts`: Introduced `assertFeatureFlag` helper throwing 403 `FEATURE_FLAG_DISABLED` with denial tracking.
4. **Leak-Proof Canary Verification & Schema Snapshot (`src/test/access-denials.test.ts`)**:
   - Comprehensive test suite (14 tests) validating exact Firestore event schemas, 90-day expiration timestamps, IPv4/IPv6 coarse subnet truncation, and route pattern normalization.
   - Canary injection test asserts that synthetic canary secrets in headers, request bodies, query parameters, and resource IDs never leak into audit records, server logs, or error responses.
   - Validated sharded counter increments and security alert document creation when denial threshold (>10/hr) is breached.
   - Total test suite now: 82 test files, 440 tests passing.

## Batch V4-01 — Zillionaire Route Migration, Access Matrix & Anti-Probing Parity

### Context & Requirements

V4-01 mandates decommissioning legacy `/admin/*` and `/api/public/v1/admin/*` paths in favor of `/zillionaire/*` and `/api/public/v1/zillionaire/*`. Legacy admin paths must present generic 404 parity with `noindex` rather than revealing administrative presence. All module routes, access resolvers, and route tests must align with the new canonical hierarchy.

### Architecture & Implementation

1. **Route Renaming & Anti-Probing 404**:
   - Renamed all console page routes (`src/routes/admin.*.tsx` -> `src/routes/zillionaire.*.tsx`).
   - Renamed all API endpoints (`src/routes/api/public/v1/admin/*` -> `src/routes/api/public/v1/zillionaire/*`).
   - Any request to retired `/admin/*` paths resolves to the generic 404 `NotFoundView` without leakage of administrative features or specialized error codes.
2. **Access Resolvers & Module Guards**:
   - Maintained `requireZillionaireModule` as canonical access resolver while providing backward-compatible `requireAdminModule` alias.
   - Updated client navigation and API calls across console guards and view components to target `/api/public/v1/zillionaire/*`.
3. **Route Matrix & Test Synchronisation**:
   - Updated `scripts/route-access-matrix.mjs` to catalog `zillionaire` console and API routes under the `zillionaire module` guard class.
   - Regenerated `docs/ROUTE-ACCESS-MATRIX.md` (190 routes) and updated the reviewed fixture `src/test/fixtures/role-matrix-routes.json`.
   - Updated `src/test/route-guards.test.ts` to assert guarded isolation on all console routes.
4. **Verification & Quality Gate**:
   - `bun run scan:public-text` passed cleanly.
   - `bun x tsc --noEmit` clean (0 errors).
   - `bun run lint` passed (0 errors).
   - Full Vitest suite: 89 test files, 2,380 tests passed cleanly.
   - Production bundle built cleanly (`dist/client`, `dist/server`).

## Batch V4-02 Batch 01 — Viewer 360 Control Engine

- 2026-11-19 — Implemented Viewer 360 in `zillionaire.viewers.tsx` and `/api/public/v1/zillionaire/users/$uid/` supporting multi-attribute search (email, ID, name, phone, wallet, device), 9 profile tabs (Profile, Wallet/ledger, Payments, Receipts, Watch history, Devices/sessions, Comments, Security, Notes), mandatory-reasoned actions (suspend, unsuspend, restrict, ban, force sign-out everywhere, revoke device, change email, mark verified, password reset link, disable parental PIN, country update prior to wallet settlement, soft delete/anonymize), targeted in-app/email messaging with templates, and audited wallet balance credit/debit with Paystack references.

## Batch V4-02 Batch 02 — Receipts and Money Documents Registry

- 2026-11-19 — Implemented sequential receipts engine (`BQ-REC-...`, `BQ-PAY-...`, `BQ-REF-...`) with Firestore atomic sequence generator, Zillionaire receipts console (`zillionaire.receipts.tsx`), PDF/printable document generation endpoint, resend email capability with audit logging, and customer lifetime spend aggregation.

## Batch V4-02 Batch 03 — Content Control (Veto Power)

- 2026-11-19 — Implemented Movies & series veto control screen (`zillionaire.movies.tsx`) with instant playback block, 30-day soft delete, in-console master playlist preview player, copyright complaint takedown workflow, reprocess job queuing, metadata editing, and multi-asset bulk actions.

## Batch V4-02 Batch 04 — Blocked Content Log

- 2026-11-19 — Implemented dedicated Blocked Content compliance registry (`zillionaire.blocked-content.tsx`), DMCA/copyright complaint notice inspection modal, and one-click owner instant unblock route (`/api/public/v1/zillionaire/blocked-content/$assetId/unblock`).
- **v4-02-batch05**: Implemented Channels Master Control console (`/zillionaire/channels`) and API endpoints (`api/public/v1/zillionaire/channels/` & `$channelId/actions`). Supports complete channel governance across platform and provider channels: verified badge grants/revocations, instant suspension with content playback lock, featured homepage showcase, audited ownership transfer, 30-day soft deletion with restore, handle modification, live broadcast permissions, and per-channel revenue share split overrides (70/30, 80/20, 85/15, 50/50, 100/0).

## Batch V4-02 Batch 06 — Revenue Share, Payouts Review & Settlement, and Payments Reversal

- 2026-11-19 — Implemented Payouts Control Console (`/zillionaire/payouts`) and Payments Control Console (`/zillionaire/payments`) alongside `/api/public/v1/zillionaire/payouts/` and `/api/public/v1/zillionaire/payments/` endpoints.
  - Payouts: Full lifecycle management (approve, reject, hold, unhold, and mark paid / settle with settlement reference and audit logging) with live split & net calculator.
  - Payments: Comprehensive transaction filtering (by status, gateway, reference, UID, date range), gateway reconciliation status tracking, and two-step confirmation reversal modal requiring typed safety confirmation (`REVERSE`) and audit tracking.
  - Role isolation: Maintained strict `payouts` and `payments` module requirements under `requireZillionaireModule` with 219 routes catalogued in route-access matrix and 2,687 passing tests.

## Batch V4-02 Batch 07 — Producers Verification & Channels, and Providers Allowlist & Licence Vault

- 2026-11-19 — Implemented Producers Directory & Governance, and Providers Licence Vault & Allowlist:
  - Producers (`/zillionaire/producers` & `/api/public/v1/zillionaire/producers/*`): Producer verification review with signed evidence inspection, approve/reject/request evidence actions, instant creator suspension/unsuspension, view assigned channels and balance/lifetime earnings, and verified audit-trailed payout bank account editing (`update_payout_account`).
  - Providers (`/zillionaire/providers` & `/api/public/v1/zillionaire/providers/*`): Approved email allowlist management (add email, Verify, Grant, Revoke, Suspend) with immediate active session invalidation on Revoke. Licence and contract vault for binding agreements and valid date windows, monthly settlement statement review, dispute resolution portal, and non-metered test playback verification for linear FAST channels.
  - Sign-up Gating: Provider Console sign-up strictly limited to approved emails (returning exact message `Access denied. Contact tv@bqsqwad.com`), while Producer Console sign-up remains open.
  - Route Access & Quality: 220 routes catalogued in `ROUTE-ACCESS-MATRIX.md` with full role-matrix validation, clean public-text scan, and 2,697 passing Vitest tests.

## Batch V4-02 Batch 08 — Moderation & Community Safety

- 2026-11-19 — Implemented Moderation & Community Safety engine:
  - Zillionaire Moderation Console (`/zillionaire/moderation` & `/api/public/v1/zillionaire/moderation/`): Comments queue with approve, hide, delete, ban commenter, and shadow-ban actions; user reports registry with resolution notes; auto-flagging keyword dictionary filter; rating abuse & brigading detection; and per-title comments on/off control respecting `commentsOpen`.
  - Viewer Reporting & Gating (`/api/public/v1/content-reports/`): Viewers submit reports on comments, assets, channels or users with rate-limiting. Comments endpoint enforces `commentsOpen !== false`, bans, shadow-bans, and keyword checks. Rating endpoint detects high-velocity and 1-star brigading anomalies.
  - Android & Web Client Integrity: Verified web player comments & rating integration and updated Android `CatalogApi` and `CatalogRepository` with complete data models and methods.
  - Route Access & Tests: Catalogued 222 routes in `ROUTE-ACCESS-MATRIX.md`, verified role-matrix expectations, passed clean public-text scan, and passed all 2,717 Vitest tests across 92 files.
- 2026-11-19: V5-01 Batch 2 complete: Multi-channel notifications console, segmented broadcasts, templates, user previews, and quiet hours.
- V5-01 B3: Safety centre in one tabbed screen; audit log is its own route; view-as requires reason and is client-side for now.
- 2026-11-19: V5-01 Batch 4 complete: Settings & platform controls (/zillionaire/settings) with tabbed layout (Maintenance & Ticker, Session & Rate Limits, Geofencing & IP Blocks, Wallet & Commerce, App & Legal Gates, Communications & Sender). Shared types isolated to src/lib/platform-settings-types.ts to prevent client/server leak. Route access matrix expanded to 228 routes.
- 2026-11-19: V5-01 Batch 5 complete: Zillionaire Overview (/zillionaire) rebuilt to reference design with ConsoleShell, ConsoleWelcomeBanner ("PLATFORM OWNER"), real-time system health strip with live sync, four gradient KPI cards with direct navigation, interactive needs-attention priority queue replacing all "Setup pending" cards, revenue area chart with period selector, live broadcast feed monitor, top content and top channels rankings, and recent activity log.

- 2026-11-19: V5-01 Batch 6 adds a unified approvals queue with existing Firestore collections, SLA ordering, mandatory decision/assignment reason, auditable actions, in-app submitter notifications, and role-matrix coverage; email/push delivery is not implemented in this batch.

- 2026-11-19: V5-01 Batch 7 adds Finance Control Centre (/zillionaire/finance) and Global Wallets Explorer (/zillionaire/wallets):
  - Revenue Dashboard: Gross platform revenue, producer contractual share (70%), platform net margin (30%), live wallet reserve liability totals, daily revenue breakdown with SVG trend visualization, and channel-by-channel revenue & transaction breakdown.
  - Ledger Explorer: Global multi-wallet transaction ledger with search (UID, description, reference), kind filter (topup, spend, refund, reversal, payout), and CSV export.
  - Reconciliation & Chargebacks: Exceptions queue with dispute chargeback notes trail, exception resolution dialogs, and audited customer refund issuance with ledger reversal entries.
  - Month-End Accounting Close & Payout Calendar: Immutable period locking (`financialPeriods`) requiring mandatory audit reasons, historical locked periods registry, and bi-weekly creator payout settlement calendar with cutoff and disbursement milestones.
  - Anomaly Monitor: Automated heuristic detection of sudden top-up volume velocity surges, repeated payment card reversal bursts, and high-value debits with mandatory audit reason dismissal.
  - Route Access & Quality: Navigation wired to ConsoleShell under Money section, dead `/zillionaire/wallets` link resolved, 233 routes catalogued in `ROUTE-ACCESS-MATRIX.md`, role-matrix expectations verified, and all 2,850 Vitest tests passing.

## V5-01 Batch 8 — Support desk and user accounts (2026-11-19)

- Unified support desk at `/zillionaire/support` with ticket priority, status workflow, internal operator notes (private to team), canned reply templates, and linked records (User Account UID, Payment Reference, Receipt ID).
- Reusable audience segments with min-spend, platform, and geographic criteria saved to Firestore `userSegments` with audience count estimates and CSV export.
- Account recovery challenge queue at `/api/public/v1/zillionaire/support/` with identity check verification (email, billing, device fingerprint); operators never view or handle plaintext user passwords, dispatching cryptographic verification tokens.
- Role matrix and route access matrix updated to 234 routes with all 96 test files / 2,865 tests passing.

## V5-01 Batch 9 — Tests, rename sweep, push log (2026-11-19)

- Full Vitest suite passing: 97 test files / 2,868 tests green.
- Public-text scan (`scripts/scan-public-text.mjs`) passing with 0 findings across all routes and components.
- Added `src/test/no-admin-strings.test.ts` to permanently enforce zero occurrences of "admin" or "administrator" in user-visible UI text, router paths, and single-owner configuration.
- Cleaned vendor leakage (Firebase, Cloudflare, Modal, Lovable, tokens, public endpoints) in Zillionaire settings and notifications to ensure pristine brand compliance.
- Verified 234 routes in `docs/ROUTE-ACCESS-MATRIX.md`.
- Completed all 9 batches of V5-01 (Finish Zillionaire Control + Catch-Up).

### V5-02 Batch 1: Upload Studio & Ingestion Pipeline

- Built `/zillionaire/upload-studio` and `/api/public/v1/zillionaire/upload/` providing multi-format uploads (Movie, Series, Episode, Trailer, Live recording).
- Integrated chunked resumable upload mechanics with progress tracking, pause/resume, retry, and Direct Publish mode for instantaneous MP4/HLS availability without blocking on worker transcoding.
- Wired automated fallback to background transcode queues with status tracking: Uploading, Verifying, Processing, Needs Review, Ready, Published, Failed.
- Added file sanity checks: type validation, size limits (up to 5GB), SHA-256 duplicate detection, codec checking, and owner access verification.
- Documented single-owner worker deployment instructions in `docs/OWNER-ACTIONS.md` section 13.
- Maintained strict zero-admin naming and brand guidelines, verified public-text scan clean, and passed all 98 Vitest suites (2,893 tests).

### V5-02 Batch 2: Series, Seasons & Episodes Pipeline

- Built `/zillionaire/series` and `/api/public/v1/zillionaire/series/` for comprehensive episodic content management under the content module.
- Implemented series hierarchy with nested seasons and episodes, reordering, and bulk auto-numbering.
- Added episode status controls (Draft, Scheduled, Published, Archived) with automated release schedules.
- Supported intro/recap/outro skip markers with timestamps, binge-watch next episode triggers, coming-soon placeholders, and trailer/cast/crew metadata.
- Enforced strict Zillionaire module authorization (`content` / `catalog`), audit logging on all lifecycle changes, and verified route access matrix coverage (238 routes).
- Verified zero-admin strings test, public-text scan green, dev build passing, and full test suite passing cleanly (99 suites / 2,918 tests).

### V5-02 Batch 3: Movies Library Management & Curation

- Built `/api/public/v1/zillionaire/movies/curation/` for shelves, hero rotation schedules, and per-title curation overrides.
- Enhanced `/zillionaire/movies` with dedicated tabs for Catalogue & Takedowns, Collections & Shelves (Trending, New Releases, For You, custom rows with pin/rank), Featured Hero Rotation with start/end schedules, and Regional Geo-availability windows with Price Per Minute overrides and Free Preview minutes.
- Wired strict content module authorization, full audit logging for all curation updates, and verified 239 routes in the route access matrix.
- Verified zero-admin strings test, public-text scan clean, dev build passing, and full test suite passing cleanly (100 suites / 2,933 tests).

## V5-02 Batch 4 — Live TV

- Live channel inventory uses explicit live-channel records only; the console must not fill empty inventory with sample channels or synthetic viewer/health metrics. Unknown playback telemetry is displayed as unknown until a trusted monitor reports it.
- Channel mutations require a reason and write an audit event. A pending or rejected channel cannot be started; approvals apply only to existing pending submissions.
- HLS URLs are validated for secure playlist shape, but this does not prove stream reachability or entitlement.

## V5-02 Batch 5 — Live chat

- Chat is opt-in per published channel and is off for child profiles; account age eligibility follows the channel restriction.
- Viewer messages are private to a channel, expose only a generic viewer label, and are never copied to any replay by default.
- Viewer send/report/reaction actions are authenticated and rate-limited; owner moderation actions require the moderation module and a reason recorded in the audit chain.
- Current clients poll; this is not realtime delivery. Moderator assignment and bulk-delete UI remain deferred.

### V5-02 Batch 6 — Test Lab

- Test channels are hidden, unpublished, explicitly test-only records with an owner UID; each owner gets a separate active-lab pointer.
- The displayed virtual wallet is informational only and is not connected to billing, payments, or revenue reporting. Do not describe it as a verified per-minute charge flow.
- Cleanup is restricted to the caller's own active test-only channel and refuses deletion if the channel is published or ownership/type checks fail.
- The seven-step guide is an owner-maintained checklist; test upload, processing, playback, comments and numeric instrumentation are not automatically connected or verified yet. Read-only preview records are audited and do not impersonate a real account.

## V5-02 Batch 7 — Advertising manager

- Ad units support Web and Android separately with placement, type, size, frequency capping, priority, dates, and audience targeting (country, channel, age rating, new vs returning).
- Third-party network and SDK credentials (such as AdMob, Unity, AppLovin) are encrypted and stored server-side only; private connection keys are never sent to the browser or displayed after saving.
- Placement manager provides explicit routing across home row, below player, between episodes, exit screen, and wallet top-up page.
- Absolute child-profile and adult-channel safety gates: ads are never served to child viewer profiles or on channels rated 18+ or adult-only.
- Paid viewers ad-free option: when enabled, active subscribers and verified paid tiers receive zero commercial ads.
- Direct creative upload workflow includes owner review and approval status (pending, approved, rejected) before live rotation.

## V5-02 Batch 8 — Legal pages editor and publisher

- Added owner-only Pages console for all 12 public, producer and provider legal documents, with Markdown edit/preview, version history, compare, rollback, scheduling and one-tap default publishing.
- Draft-only records do not block account access; only published required pages with re-acceptance enabled affect acceptance checks.
- Publishing auto-fills settings or neutral standard defaults and returns a warning when any fallback was used; drafts remain separate from the published copy.
- Public legal routes resolve every documented slug through a published document, bundled default or safe fallback; unknown slugs return a not-found response without implying a supported policy is unavailable.
- Default text is a starting point and needs qualified legal review before production use.

## V5-02 Batch 9 — Legal text and storage visibility

- Rewrote default legal copy for all 12 platform documents to adhere strictly to first-person plural voice ("we", never singular "I") and neutral provider terms, removing vendor names (Paystack, Google Play, etc.) from public and policy text.
- Added comprehensive storage operations visibility directly within the Zillionaire Storage dashboard, showing total destinations, active pool counts, recorded storage usage, estimated free space against soft caps, ledger egress volumes, replica indicators, and failover status.
- Added legal-copy safety automated tests to guarantee no vendor mentions and zero first-person singular pronouns appear across defaults.

## V5-02 Batch 10 — Acceptance and isolation tests

- Added focused coverage for upload resume, audited deletion, live-chat timeout and audit evidence, plus hidden/unpublished owner-scoped test-lab creation and read-only preview.
- Catalog filtering now excludes `testOnly` channels even if a misconfigured document is published, adding a second safety boundary against public discovery and revenue pathways.
- Consolidated owner launch checks into the existing owner-actions checklist. External provider configuration and legal review remain owner actions, not claims made by automated tests.

- V5-03 Batch 1 uses mandatory password + TOTP, AES-GCM encrypted authenticator secrets, atomic single-use recovery codes and the existing five-failure lockout; passkeys and new-device email alerts remain explicitly out of scope until implemented.
- V5-03 Batch 2 protects owner wallet adjustments, payment reversals, permanent account removals, team grants/revocations, and payout settlement with a five-minute actor/action-scoped step-up token; finance dual approval, configurable daily limits, revenue-share changes, settings/secrets changes, and data exports still need separate implementation.
- V5-03 Batch 3 adds 15-minute server-checked owner idle timeout, 8-hour absolute session cap, per-session browser inventory and audited revoke-all; country/IP-change challenge and concurrent-session limit remain unavailable, and all consoles still use their existing separate auth paths.
- V5-03 Batch 4 exposes audit-chain verification, actor/target lookup and checksummed JSON export to the owner; daily verification remains dependent on the existing scheduled maintenance task, and audit immutability is enforced through server-only service-account access plus deny-all client rules.

## V5-05 Batch 1 — Navigation, Account Hub & Downloads Screen (2026-11-20)

- Implemented unified 5-tab bottom navigation across web (`ViewerBottomNav`) and native Android (`BqSqwadTvApp.kt`) in identical order: Home, Live TV, Library, Downloads, Settings.
- Added dedicated `/downloads` route and Android `DownloadsScreen` presenting designed "Coming soon" state explaining online-only high-definition edge streaming.
- Added `/live-tv` and `/library` routes to TanStack Start tree, with catalogue filters and playback links.
- Replaced basic profile link with `ProfileAccountHub` avatar dropdown containing wallet, purchases, watch history, referrals, notifications, settings, help, and console links for Producers and Providers.
V5-05 Batch 7: Reused verified wallet summary, ledger, and package APIs; usage figures come from recorded daily wallet spend, and empty-balance messaging links directly to configured top-ups.
V5-05 Batch 8: Both sign-in surfaces use the same public Google web client configuration endpoint; Android keeps a visible disabled/retry state when the ID is missing, while the web renders its disabled/retry control as configuration resolves.

V5-05 Batch 9: Android checks the live public client settings before app access, shows maintenance/force-update screens from those settings, and the public sitemap lists only viewer-facing URLs.
V5-05 Batch 10: Recorded real release checks and unresolved full-suite/native-build blockers in the release notes and ordered owner checklist; release is not marked signed off until those are cleared.

## V5-06 Batch 1 — Channel Provisioning Isolation, Producer Series/Episode Grouping & Direct Owner Password Unlock (2026-11-20)

- Restrict channel creation exclusively to Provider Console; removed channel creation from Producer Console. Producer `POST /api/public/v1/producer/channels` returns 403 `CHANNEL_CREATION_RESTRICTED`.
- Added provider channel provisioning endpoint `POST /api/public/v1/provider/channels` creating verified `liveChannels/{channelId}` tied to authenticated provider ID.
- Upgraded Producer Console with "Movies & Series Library" allowing producers to upload movies, series, and video assets. All episodes of a series are strictly grouped in one place under the series title without fragmentation.
- Added authenticated asset listing endpoint `GET /api/public/v1/producer/channels/:channelId/assets` and updated metadata persistence schema for content type, series title, season and episode details.
- Unlocked direct Zillionaire dashboard access with owner access password without requiring MFA setup prior to initial entry. Once enrolled, MFA remains strictly enforced. Authenticator secrets encryption fails closed safely if encryption keys are unconfigured.

## V5-06 Batch 6 — Ingest Architecture, Statement Settlement & Documentation Hub (2026-11-20)

### 1. Ingest Architecture: HLS Pull vs. RTMP/SRT
- **Decision**: Production live channel ingest is standardized on HTTPS HLS pull (`.m3u8` master manifest). Direct RTMP and SRT live push ingestion are officially deferred to Phase 6 infrastructure deployment.
- **Rationale**:
  - HLS pull delegates video transcoding and packaging compute to the broadcaster's existing playout encoder, eliminating multi-tenant serverless transcoding bottlenecks and reducing platform operational overhead.
  - Serverless and edge runtime environments cannot sustain long-lived stateful TCP/UDP socket listeners without specialized cluster orchestration.
  - In partner consoles, RTMP and SRT options are explicitly labelled as "Coming Soon (Phase 6)" with zero fabricated listener URLs or fake connection statuses.

### 2. Elimination of Client-Side Percentage Revenue Projections
- **Decision**: Client-side percentage revenue estimates and simulated real-time earning tickers have been removed in favor of authoritative, server-audited monthly statements.
- **Rationale**:
  - Broadcaster partnerships require legal and financial certainty. Estimating revenues based on client-side math creates contractual ambiguity and discrepancy disputes.
  - Payout calculations are computed server-side from cryptographically signed playback heartbeat sessions and settled according to master distribution agreements.

### 3. Security Boundary & Centralized Documentation Hub
- **Decision**:
  - Implemented partner and creator documentation hubs (`/provider/docs` and `/producer/docs`) with searchable, anchor-linked technical guides stored directly in the repository under `content/docs/`.
  - Introduced accessible `InfoTip` component backed by a centralized `content/help/tips.json` registry, giving contextual inline guidance for technical parameters without cluttering dashboard workflows.
  - Maintained complete isolation between Viewer, Producer, Provider, and Console surfaces with 269 strictly guarded routes and 0 unguarded endpoints.


## V6-01 Batch 7 — Naming Sanitization & Public Text Enforcement (2026-11-20)

### 1. Elimination of Legacy "Admin" References
- **Decision**: All visible routes, labels, console role types, dispute views, security filters, android labels, legal copy, and doc filenames have been completely sanitized of the term "admin".
- **Rationale**:
  - In accordance with Platform Rule 4, the platform owner control center is strictly "Zillionaire".
  - Renamed `docs/ADMIN-DASHBOARD-REPAIR-STATUS.md` to `docs/ZILLIONAIRE-DASHBOARD-REPAIR-STATUS.md`.
  - Updated `ConsoleRole` across `ConsolePageGuard` and Zillionaire routes to use `"zillionaire"`.
  - Updated `SharedDisputeSystem` and `SecurityEventsView` to use `"zillionaire"` and operator designations.
  - Enhanced `scripts/scan-public-text.mjs` to enforce forbidden terms `"admin"` and `"administrator"` on public-facing text, components, legal copy, and docs file names.


## V6-01 Batch 8 — Web & Android Parity (2026-11-20)

### 1. Navigation and View Parity
- **Decision**: Closed Android navigation gaps by adding dedicated routes and composables for `history` and `notifications` in `BqSqwadTvApp.kt`, and wired actions from `AccountScreen` and `SettingsScreen`.
- **Rationale**:
  - Aligns Android viewer capabilities with web viewer experience.
  - Linked account deletion (`https://bqsqwad.com/account-deletion`) and legal documentation across Android account and settings flows.
  - Retained Google Play in-app billing manager alongside server ledger reconciliation for cross-platform balance parity.

## V6-01 Batch 9 — Android Release Readiness & Play Store Compliance (2026-11-20)

### 1. Release Path & Signing Configuration
- **Decision**: Prepared Android build definitions for release artifact packaging (`bundleRelease` and `assembleRelease`), reading secrets from environment variables (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
- **Rationale**:
  - Ensures clean separation between open repository code and private cryptographic signing credentials.
  - Provided phone-friendly terminal instructions in `docs/OWNER-ACTIONS.md` for generating RSA-2048 upload keystore and configuring environment keys.

### 2. ProGuard / R8 Rules Optimization
- **Decision**: Expanded `android/app/proguard-rules.pro` to preserve reflection and serialization contracts across Google Play Billing, Firebase, Media3/ExoPlayer, Retrofit, Moshi, and Hilt/Dagger.
- **Rationale**: Prevents runtime serialization failures and class-not-found exceptions when `isMinifyEnabled = true` and `isShrinkResources = true`.

### 3. Versioning & Store Readiness
- **Decision**: Added `scripts/bump-version-code.mjs` for automated build number increments; documented Google Play Store Data Safety, Content Rating (IARC), Target SDK 36, in-app account deletion, and canonical privacy URLs in `docs/OWNER-ACTIONS.md`.
- **Sandbox Environment Note**: Documented that byte-compilation tasks requiring JDK 17 and Android SDK binaries cannot execute inside the web sandbox container, while the source build system, ProGuard rules, versioning automation, and Play Store submission specifications are verified.

## V6 File 02 Batch 1 — Upload Rights Declaration (2026-11-20)

- Producer Channels and Upload Studio now require the requested age band, content warnings, language, genre, ownership declaration, licence type, private proof document, copyright holder and production year.
- Rights proof accepts PDF, PNG or JPEG up to 10 MB and is stored privately under the uploader's channel/asset path. The API verifies uploader/channel scope, validates the private path, and the independent rights-review route checks the private object before approval.
- Age bands use the required All ages, 7+, 13+, 16+ and 18+ labels, mapped to the platform's existing content-rating values.
- Batch 1 finished, continuing.

## V6-01 Batch 10 — Route integrity check (2026-11-20)

- Added `bun run check:route-integrity` to ensure route source files are represented in the generated route tree and route paths are unique. It currently validates 310 route files. Full release verification remains incomplete because repository-wide type-check and lint failures and unavailable Android tooling are documented in `docs/OWNER-CHECKLIST.md`.

## V6 File 02 Batch 2 — Copyright, Fingerprint & Review Queue (2026-11-20)

### 1. Heuristic Perceptual Fingerprinting & Catalog Matching
- **Decision**: On upload completion (`/api/public/v1/storage/complete`), compute a SHA-256 content/header hash and a perceptual frame-interval fingerprint across media bytes. Match candidate fingerprints against the existing catalogue using dual-pass lookup (exact hash and near-match perceptual similarity).
- **Rationale**: Identifies prospective duplicates early in the pipeline while maintaining manual review integrity; avoids auto-rejections. Flagged uploads receive the label "Possible duplicate of <title>" and require reviewer resolution.
- **External Integration**: Configured optional `COPYRIGHT_MATCH_SERVICE_URL` and `COPYRIGHT_MATCH_API_KEY` behind environment flags for commercial matching services, documented in `docs/OWNER-ACTIONS.md`.

### 2. Multi-Producer Duplicate Publish Protection
- **Decision**: Block publishing the same video asset across different producers in `/api/public/v1/zillionaire/content-assets/$assetId/publish`.
- **Rationale**: Enforces exclusive rights and prevents piracy or duplicate channel claims over identical audiovisual assets.

### 3. Reason Codes, Review Queue & One-Time Producer Appeals
- **Decision**: Standardised rejection reason codes (`copyright_suspected`, `duplicate`, `wrong_age_rating`, `poor_quality`, `missing_proof_of_rights`, `policy_violation`, `other`) with human-readable labels and mandatory reviewer messages.
- **Decision**: Built `/zillionaire/rights-review` console and `/api/public/v1/zillionaire/rights-review` API with duplicate comparison modals, independent reviewer validation, and proof-of-rights checks.
- **Decision**: Added single-appeal mechanism for producers at `/api/public/v1/producer/content-assets/$assetId/appeal`, updating producer channels console with rejection details and appeal submission workflows.
- Batch 2 finished, continuing.

## V6 File 02 Batch 3 — Approvals Everywhere (2026-11-20)

### 1. Unified Review Queue Covering All Public Content
- **Decision**: Extended `zillionaire.approvals.tsx` and `/api/public/v1/zillionaire/approvals` so nothing goes public without explicit review: videos, series episodes, live streams, artwork assets, channels, ad creatives, provider requests, and payouts.
- **Rationale**: Enforces complete platform quality control, copyright compliance, and age-appropriateness before content reaches viewer apps or live distribution channels.

### 2. Comprehensive Reviewer Inspection & Verification
- **Decision**: Reviewers are presented with the full submission context:
  - Rights declaration (ownership declared, licence type, copyright holder name, production year)
  - Proof of rights (private document verification status and storage reference)
  - Age rating limit and content warnings
  - Perceptual duplicate & copyright detection result (clean/unique vs. "Possible duplicate of <title>" with hash and flag)
  - Interactive media preview player for video/audio streams, HLS feeds, and high-resolution artwork posters.

### 3. Reviewer Actions & Producer Notifications
- **Decision**: Supported four core reviewer actions: `approve`, `reject` (with standardized reason codes and explanatory note), `request_changes` (retaining draft status and requesting specific revisions), and `assign`.
- **Decision**: Automated instant push and in-app notifications to submitters/producers upon every review decision with audit logging in platform ledger.
- **Decision**: Enforced "Content review" (`content`) role or `moderation` role for delegated reviewers.
- Batch 3 finished, continuing.

## V6 File 02 Batch 4 — Public Copyright Reporting & Moderation Cases (2026-11-20)

### 1. Public Copyright Infringement Reporting Entry Points
- **Decision**: Added accessible copyright takedown reporting entry points across the viewer surface:
  - "Report this video" button and modal on `content.$assetId.tsx` (above description and inside player overlay controls)
  - "Report channel" link on `channels.$channelId.tsx`
  - Dedicated public takedown notice page at `/copyright-report` supporting deep-linked `?assetId=` and `?channelId=` parameters.
- **Rationale**: Complies with DMCA and statutory notice obligations, allowing copyright owners or their authorized agents to submit takedown notices without an account.

### 2. Required Claimant Information & Legal Affirmations
- **Decision**: All copyright submissions require:
  - Reporter full legal name, contact email, and optional organisation/studio
  - Targeted video ID, channel ID, or content URL
  - Detailed description of the claimed copyrighted work
  - Optional proof link or public registration catalogue entry
  - Mandatory good-faith belief statement
  - Mandatory penalty-of-perjury accuracy statement
  - Electronic signature (typed full legal name)
  - Hidden honeypot field for anti-spam filtering.

### 3. Immediate Review State & Counter-Notice Initiation
- **Decision**: Filing a claim automatically updates the target video in `contentAssets/{assetId}` to `contentStatus: "under_review"`, sets `reviewQueueFlag`, starts a statutory 14-day counter-notice deadline, and conditionally hides the content per platform owner policy.
- **Decision**: Automatically sends an in-app notice to the producer informing them of the claim, claimant details, and counter-notice deadline, and logs an audit record.

### 4. Zillionaire Moderation Copyright Cases & Repeat-Infringer Policy
- **Decision**: Integrated a dedicated "Copyright Cases" tab in `zillionaire.moderation.tsx` backed by `/api/public/v1/zillionaire/copyright-cases/`.
- **Decision**: Reviewers can inspect the complete claim details, timeline, proof, and producer repeat-infringer strike count (out of 3).
- **Decision**: Provided three adjudication actions:
  - `remove` (enforces DMCA takedown, hides content, increments producer copyright strike, notifies producer and claimant)
  - `keep` (dismisses claim, clears under-review status, restores video to published status)
  - `restore` (restores content after successful counter-notice resolution).
- Batch 4 finished, continuing.

## Batch 5 — Live stream approval workflow, state machine transitions, HLS validation, and broadcast controls

### 1. Mandatory Pre-Air Live Stream Approvals
- **Decision**: No live stream may broadcast until approved by the platform owner or an operator assigned the delegated `live_approvals` role.
- **Decision**: Added `live_approvals` and `rights_review` modules to `ZillionaireModule` with backward compatibility falling back to `channels` and `content`/`moderation`.

### 2. Live Stream State Machine
- **Decision**: Implemented formal lifecycle states: `draft` -> `submitted` -> `approved` -> `scheduled` -> `live` -> `ended`, with dedicated `rejected` and `suspended` branches.
- **Decision**: The `GO_LIVE` action strictly enforces that streams must be in `approved` or `scheduled` state before going on-air; attempts to broadcast from unapproved or suspended states return explicit errors.

### 3. Submission Technical & Rights Proof Guardrails
- **Decision**: Enforced HTTPS HLS playlist verification (`https://...` ending in `.m3u8`) across platform and provider channel endpoints.
- **Decision**: Enforced rights verification documentation (licence number or executed agreement) prior to submission.

### 4. Immediate Force-Stop Emergency Control & Visual State Badges
- **Decision**: Added owner emergency `FORCE_STOP` action in API and live TV console (`zillionaire.live-tv.tsx`) that immediately cuts live playback, marks stream as `suspended`, audits action, and sends priority notice to the channel operator.
- **Decision**: Updated live TV console with distinct status badges and scheduling controls.
- Batch 5 finished, continuing.

## Batch 6 — Collaboration and automatic revenue split

### 1. Co-Production Split Agreement & Confirmation Workflow
- **Decision**: Added support for co-producers to agree on title-level revenue splits (e.g. 70/30, 94.5/5.5). The sum of shares must equal exactly 10,000 basis points (100.00%) with all individual shares strictly positive.
- **Decision**: Added versioning (`version: number`) and confirmation tracking (`pending_confirmation` -> `active`). Any revision increments the agreement version and requires all parties to re-confirm before automated payouts proceed.

### 2. Exact Integer Arithmetic & Zero Lost Minor Units
- **Decision**: Extended `src/lib/server/billing-engine.ts` with `splitRevenueExact` and `calculateProducerPool` using exact BigInt integer division. Any remainder minor units resulting from division are systematically allocated to the primary/largest stakeholder, guaranteeing zero lost minor units across any currency allocation.

### 3. Permanent Confidentiality of Platform Share & Producer Delete Ban
- **Decision**: Platform take and rates per minute are configured strictly by the platform owner and are permanently hidden from producers.
- **Decision**: Affirmed and surfaced platform policy that producers cannot delete ingested catalogue videos; video deletion and restoration are reserved exclusively for the platform owner to protect subscriber rights and revenue audit trails.

### 4. Producer & Platform Revenue Interfaces
- **Decision**: Created producer collaborations management page (`src/routes/producer.collaborations.tsx`) and API endpoint (`/api/public/v1/producer/collaborations/`) for creating split agreements, tracking confirmations, managing revisions, and raising dispute flags.
- **Decision**: Enhanced Zillionaire finance console (`src/routes/zillionaire.finance.tsx`) with a dedicated "Splits & Collaborations" tab for auditing agreements and settlement status.
- Batch 6 finished, continuing.

## Batch 7 — Pricing control

### 1. Multi-Tier Resolution Hierarchy & Free Playback
- **Decision**: Enhanced `src/lib/server/pricing.ts` with multi-tier price resolution across promotional windows, channel live events, episode overrides, movie/title rates, series rates, live streams, channel defaults, category rates, and platform defaults.
- **Decision**: Enabled explicit free viewing (`0` minor units / `isFree: true`) across any level (free pilots, free news category, free promo hours, free movie titles) without requiring viewer wallet balance holds.

### 2. Promo Pricing Schedules & Bundles
- **Decision**: Added support for time-bounded promotional pricing windows (`promoPricingWindows`) with ISO start/end windows, allowing percentage discounts or zero/reduced minor unit overrides.
- **Decision**: Added content bundles schema for packaged multi-title access passes (`bundles`).

### 3. Strict Producer & Provider Confidentiality
- **Decision**: Platform take, rates per minute, and pricing margin configuration remain strictly owner-only and are completely excluded from producer and provider API payloads. Viewers see price per minute or "Free viewing" clearly on title screens prior to playback.

### 4. Owner Pricing Control Console & History
- **Decision**: Extended `src/routes/zillionaire.pricing.tsx` with dedicated tabbed sections for Defaults & Currencies, Movies/Series/Episodes, Channels & Live Streams, Categories, Promos & Bundles, and a Versioned History audit log backed by `/api/public/v1/zillionaire/config/pricing`.
- Batch 7 finished, continuing.

## Batch 8 — Payout window, settlement states & payment policy

### 1. Payout Window Schedule & Mandatory Delay Disclosure
- **Decision**: Established universal payout calendar logic in `src/lib/payout-calendar.ts` calculating the regular payout window between the 30th and the 1st of each month (`PAYOUT_WINDOW_START_DAY = 30`, `PAYOUT_WINDOW_END_DAY = 1`).
- **Decision**: Surfaced the explicit required disclosure across Producer and Provider consoles: *"Payouts are processed between the 30th and the 1st of each month; bank and international settlement may take longer."* with real-time indicators for upcoming or currently open processing cycles.

### 2. Owner Settlement Workflow & Notification Pipeline
- **Decision**: Expanded `/api/public/v1/zillionaire/payouts/$payoutId/settle` to support full settlement (`SETTLE`/`PAID`), partial settlement (`PARTIAL`), failure handling (`FAIL`), and official reversal (`REVERSE`).
- **Decision**: Required owner input for amount paid (minor units), unique settlement/banking reference, and exact settlement date on every paid disbursement.
- **Decision**: Automatic dispatch of in-app notifications and queuing of email notifications to producers/providers upon disbursement completion.

### 3. Immutable Financial Ledger & Non-Destructive Reversals
- **Decision**: Strictly enforced policy that payment and payout records are never deleted from the platform. Any reversed payment writes an immutable append-only record to `payout_reversals`, marks the original payout status as `REVERSED`, and records timestamped reversal reasons and audit logs.
- **Decision**: Every document, statement, and receipt carries cryptographic sha256 checksums, UTC timestamps, and permanent archival markers.

### 4. Searchable Statements & Downloadable PDF Receipts
- **Decision**: Built `src/lib/pdf-statement.ts` providing standardized, print-ready, styled HTML and PDF downloadable receipts and statements for both platform owners and record owners (producers and providers).
- **Decision**: Added searchable disbursement records and instant PDF receipt download in `src/routes/zillionaire.payouts.tsx` and consolidated PDF statement export in `src/routes/zillionaire.finance.tsx`.

### 5. Public Payment & Payout Policy
- **Decision**: Published a dedicated public policy route at `/payment-and-payout-policy` detailing the payout cycle (30th to 1st), minimum disbursement thresholds, KYC tier verification requirements, permanent immutable records, and banking delay guidelines.
- Batch 8 finished, continuing.

## Batch 9 — Granular Dashboard Roles, Scoped Delegation & Escalation Prevention

### 1. Universal Selectable Dashboard Job Permissions
- **Decision**: Catalogued and exposed all 17 distinct dashboard jobs as selectable permissions in `src/lib/team-types.ts`: Users, Content Review, Rights Review, Live Approvals, Channels, Pricing, Finance, Payouts, Ads, Notifications, Moderation, Support, Security, Pages, Storage, Reports, and Team View.
- **Decision**: Mapped permissions directly to internal platform modules while presenting clear human-readable labels, categorized by domain (operations, content, finance, security, system).

### 2. Owner-Controlled Custom Role Templates & Delegation
- **Decision**: Empowered platform owner to create and persist custom role templates in Firestore (`system_settings/role_templates`) bundling any subset of dashboard jobs with custom titles and descriptions.
- **Decision**: Expanded `/api/public/v1/zillionaire/team` to support owner role creation (`create_role`), staff delegation (`invite`), and granular permission assignments with optional expiry dates (`expiryDate`).

### 3. Strict Privilege Escalation Guards & Immutable Hierarchy
- **Decision**: Strictly enforced in both backend handlers (`/api/public/v1/zillionaire/team` and `/api/public/v1/zillionaire/team/$uid`) that people with a delegated role cannot change their own role or anyone else's (`OWNER_AUTHORITY_REQUIRED` and `SELF_ROLE_CHANGE_DENIED`).
- **Decision**: Read-only display and explanatory banners presented in UI when non-owner operators access the Team & Roles console.

### 4. Tenant-Scoped Producer & Provider Team Management
- **Decision**: Implemented isolated team APIs and consoles for Producers (`/api/public/v1/producer/team` and `src/routes/producer.team.tsx`) with scoped roles: `upload`, `analytics`, `comments`, `collaboration`.
- **Decision**: Implemented isolated team APIs and consoles for Providers (`/api/public/v1/provider/team` and `src/routes/provider.team.tsx`) with scoped roles: `channels`, `schedule`, `statements`.
- **Decision**: Strictly enforced tenancy checks ensuring studios and broadcast networks can only inspect and manage team members within their own organization.

### 5. Full Audit Visibility for Delegated Operations
- **Decision**: Added dedicated Activity & Audit tab in `src/routes/zillionaire.team.tsx` enabling the platform owner to inspect every action performed by team members with actor UID, action name, target reference, reason, and timestamp.
- Batch 9 finished, continuing.

## Batch 10 — Viewer Features: Reactions, Watch Parties, Comment Moderation & Player Experience

### 1. Like and Dislike Reaction Architecture & Liked Library
- **Decision**: Implemented high-performance reactions API at `/api/public/v1/reactions` and liked library endpoint at `/api/public/v1/user/library/liked`.
- **Decision**: Maintained aggregate counter summaries (`reactions_summary/{targetType}_{targetId}`) with concurrent vote delta resolution and voter state tracking in Firestore.
- **Decision**: Added interactive Like and Dislike buttons with live counts across on-demand content (`content.$assetId.tsx`) and live TV channels (`channels.$channelId.tsx`).
- **Decision**: Added dedicated "Liked Content" tab in the viewer Library (`src/routes/library.tsx`) rendering favorited videos, channels, and streams.

### 2. Synced Watch Party System with Independent Billing
- **Decision**: Created Watch Party backend (`/api/public/v1/watch-parties` and `watch-parties/$partyId`) supporting movies, episodes, channels, and live streams with configurable capacity (2 to 50 viewers).
- **Decision**: Enforced Kids Safe Mode guards: age-restricted content (18+, R, TV-MA) is blocked from creation or joining for viewers with kids mode enabled.
- **Decision**: Built full-screen synchronized watch room (`src/routes/watch-party.$partyId.tsx`) featuring host playback controls (play/pause/seek sync), participant kick actions, room termination, and real-time room chat.
- **Decision**: Implemented independent per-viewer heartbeat metering (`watch_party_billing`) ensuring each participant is billed solely for their own watch minutes.

### 3. Share Links, OpenGraph Cards & Android Deep Linking
- **Decision**: Added deep link generation and Web Share API integration across viewer interfaces.
- **Decision**: Configured OpenGraph and Twitter preview metadata (`og:title`, `og:description`, `og:image`, `twitter:card`) for social sharing.
- **Decision**: Added Android deep link intent filters and navigation composables for `bqsqwad://watch/{id}` and `bqsqwad://party/{id}` in `android/app/src/main/java/com/bqsqwad/tv/ui/BqSqwadTvApp.kt`.

### 4. Comment Reporting Workflow
- **Decision**: Built public comment reporting endpoint at `/api/public/v1/comment-reports` supporting harassment, hate speech, spam, inappropriate content, and spoilers.
- **Decision**: Added flag button on each viewer comment in `content.$assetId.tsx` with modal reporting and automatic moderation status flagging upon multiple reports.

### 5. Advanced Player Experience & Notification Preferences
- **Decision**: Added Sleep Timer selector (Off, 15m, 30m, 45m, 60m) with automatic countdown and playback pause on expiration.
- **Decision**: Added Skip Intro trigger and Next Episode countdown integration with Watchlist reminder notifications.
- **Decision**: Built notification preferences API at `/api/public/v1/user/notification-preferences` and settings tab in `src/routes/notifications.tsx` for watchlist releases, live broadcasts, watch party invites, and billing receipts.
- Batch 10 finished, continuing.

## Batch 11: Zillionaire Control Centre Operations & Extra Governance Consoles

- **Status**: Implemented
- **Date**: 2026-11-20
- **Scope & Rationale**:
  - Implemented the complete set of required operational oversight and governance consoles across the Zillionaire Control Centre with role & module authorization gates (`ConsolePageGuard`).
  - Added unified `ZillionaireEntityConsole` reusable engine supporting responsive data tables, KPI summary cards, filter tabs, field search, modal deep inspection, and governance action triggers.
  - Implemented 16 specialized operational consoles:
    1. `/zillionaire/copyright-cases`: DMCA and copyright claims management, counter-notices, evidence links, and resolution audit.
    2. `/zillionaire/collaborations`: Platform-wide co-production split contracts, contributor revenue shares, and approval audits.
    3. `/zillionaire/splits-audit`: Ledger reconciliation engine auditing BigInt fractional payout calculations against gross pool balances.
    4. `/zillionaire/support-macros`: Response templates and canned resolutions for producer and viewer dispute desks.
    5. `/zillionaire/announcements`: Global banner broadcast scheduler targeting viewers, producers, or providers.
    6. `/zillionaire/geo-rules`: Country-level allow/block rule engine for content rights enforcement by ISO territory code.
    7. `/zillionaire/content-calendar`: Scheduled release planner, premiere embargo times, and broadcast slots.
    8. `/zillionaire/strikes-appeals`: Policy violation strike manager and appeals arbitration workflow with strike expirations.
    9. `/zillionaire/scheduled-reports`: Automated CSV/PDF scheduled financial and operational digest emailer.
    10. `/zillionaire/privacy-requests`: GDPR/NDPR data export and deletion compliance queue.
    11. `/zillionaire/moderation-workload`: Real-time queue metrics, SLA breach tracking, and moderator shift assignments.
    12. `/zillionaire/fraud-watch`: Multi-account syndication detector, chargeback patterns, and suspicious ASN/VPN alerts.
    13. `/zillionaire/status-page`: Public system status editor with component health and outage incident publisher.
    14. `/zillionaire/releases`: Mobile APK/AAB and TV build versioning, force-upgrade gates, and maintenance lock.
    15. `/zillionaire/search-tuning`: Query synonyms, priority title pinning, and algorithmic discovery weights.
    16. `/zillionaire/trending-rails`: Homepage carousel layout editor, category feed sequencing, and audience safety filters.
  - Connected all 16 modules into `ConsoleShell.tsx` navigation tree respecting tenant and module boundaries.
  - Validated with targeted Vitest test suite (`batch11-zillionaire-extras.test.ts`), public-text verification, and production build generation.

## Batch 12: Comprehensive Role Matrix, State Transition Suites, and Owner Audit Verification

- **Status**: Implemented
- **Date**: 2026-11-20
- **Scope & Rationale**:
  - Registered and reviewed role-matrix rows in `src/test/fixtures/role-matrix-routes.json` for all 33 new API endpoints and console page shells introduced across File 02.
  - Validated generated role-matrix suite (`generated-role-matrix.test.ts`) across 3,112 granular caller/route access combinations verifying strict deny-by-default isolation for anonymous, viewer, tenant, module delegate, worker, and owner callers.
  - Executed fuzzing access test (`deny-by-default-fuzz.test.ts`) and verified full cross-tenant data protection.
  - Implemented copyright case lifecycle state machine test suite (`batch12-copyright-cases-and-matrix.test.ts`) enforcing notice, counter-notice, and resolution validation.
  - Verified BigInt collaboration revenue split math, dual duplicate video perceptual fingerprinting, and live-stream approval workflow suites.
  - Completed production client/SSR/Nitro build with clean zero-error compilation and passing public-text security scan.

## V6-05 Batch R0: Resume & Verification of Main State

- **Status**: Implemented & Verified
- **Date**: 2026-11-20
- **Scope & Rationale**:
  - Inspected repository `main` through GitHub connector. Verified head SHA `d5ab720517617228efab6bfb97328faed3f36128` (commit "test(security): implement batch 12 role matrix and state transition verification suites").
  - Verified presence of File 02 Batches 1 through 12 on `main`.
  - Verified File 03 Batch 1 status: PARTIAL (ProviderRegistrationFlow.tsx and provider.index.tsx present; providerKyb collection and approve_kyb actions absent).
  - Confirmed `bun run build`, `bun run scan:public-text`, and `bun run check:route-integrity` (346 routes) all pass with zero errors.

## V6-05 Batch R1: Verification Terminology Normalization (KYC)

- **Status**: Implemented & Verified
- **Date**: 2026-11-20
- **Scope & Rationale**:
  - Replaced legacy verification terminology in `src/routes/zillionaire.support-macros.tsx` with standard KYC identifiers and labels.
  - Added idempotent migration and read fallback helper in `src/lib/server/kyc-migration.ts` ensuring zero data loss if legacy provider verification documents exist.
  - Implemented automated verification test (`src/test/no-legacy-verification-names.test.ts`) that scans `src`, `android`, `scripts`, and `docs` to prevent regressions.
  - Verified `bun run scan:public-text` and `bun run build` pass cleanly.

## V6-05 Batch A1: KYC Data Model, Field Encryption & Private Storage

- **Status**: Implemented & Verified
- **Date**: 2026-11-20
- **Scope & Rationale**:
  - Implemented standard KYC schema in `src/lib/server/kyc/types.ts` (`kycStatus`, `kycType`, `kycCountry`, `kycVersion`, `kycSubmittedAt`, `kycReviewedAt`, `kycReviewedBy`, `kycRejectionReason`, `kycHistory[]`).
  - Added AES-256-GCM field-level encryption for sensitive attributes (ID numbers, tax numbers, DOB, account numbers) with configurable secret `KYC_FIELD_ENCRYPTION_KEY`.
  - Added safe data-masking utilities for table and list representations.
  - Implemented secure isolated vault path generator in `src/lib/server/kyc/storage.ts` ensuring no raw or guessable URLs are exposed.
  - Added strict document validation (MIME types, 10KB min / 10MB max, magic bytes checks, SHA-256 hashing) and short-lived 60-second signed viewer URLs with forensic watermark overlay metadata.
  - Documented secret keys in `docs/OWNER-ACTIONS.md`.
  - Verified with dedicated unit test suite (`src/test/batch-a1-kyc-storage.test.ts`).
