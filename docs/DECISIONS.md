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
