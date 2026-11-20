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

- 2026-11-18 — Automatic checks enabled on push to  and  via . Concurrency cancels obsolete runs, actions are pinned to immutable commit SHAs, and jobs independently isolate , , , , , , and . Manual workflows remain preserved.
- 2026-11-18 — Decisions superseding earlier orders (File 00):
  1. Automatic checks are now on. The owner asked for the role-isolation and workflow suites to run on every change and block on failure. Because there are no pull requests, add a workflow that runs on every push to  (and on pull requests if one is ever opened), with path filters, concurrency that cancels older runs, and a failing run reported on the commit. Keep the old manual workflows as they are.
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
