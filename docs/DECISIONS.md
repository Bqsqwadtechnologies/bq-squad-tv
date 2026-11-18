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
- Dispute threads: Dispute threads are bidirectional and support operator replies via `/api/public/v1/admin/support/messages` and provider replies via `/api/public/v1/provider/disputes`. Thread isolation prevents any other provider from reading or appending to foreign dispute threads.
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
  - Maintained backward-compatible aliases (`AdminModule`, `requireAdminModule`, `ADMIN_MODULES`) across the codebase.
  - Read path in `resolvePlatformAccess` supports both `zillionaireModules` and legacy `adminModules` with automated logging.
  - Created idempotent owner migration endpoint `POST /api/public/v1/admin/migration/zillionaire` with tamper-evident audit trail.
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
   - `PUT /api/public/v1/admin/users/$uid/permissions` validates all modules against `ZILLIONAIRE_MODULES`.
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
