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
