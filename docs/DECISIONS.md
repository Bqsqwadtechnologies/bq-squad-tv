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
