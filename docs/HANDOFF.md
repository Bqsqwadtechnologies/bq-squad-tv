# Project Handoff

## Current Status
- Prompt V6-07 Batch Q1 Complete & Verified on main (remote SHA: `47cce43a09edfc3022fc56e9fc98bcd67ef5823e`).
- All fake percentages, hardcoded trend arrows, and synthetic sine/cosine analytics removed from web routes and APIs.
- Android codebase verified free of hardcoded percentages or mock UI design metrics.
- Mathematical delta helper (`src/lib/delta.ts`) implemented and tested with 9 unit tests.
- Scanner `scripts/scan-fake-numbers.mjs` registered as `scan:fake-numbers` in package.json.
- Audit report published at `docs/FAKE-NUMBERS-REPORT.md`.
- Next batch: Proceed to `Batch Q2 — Remove all fake movies, series, channels and live streams, including their files`.

## Checks Passed
- `bun run scan:fake-numbers`: Passed (0 violations)
- `bun run scan:public-text`: Passed
- `bun run check:route-integrity`: Passed (380 routes verified)
- `bun run build`: Passed (Vite client, SSR, Nitro cloudflare-module preset)
- `vitest run src/lib/delta.test.ts src/test/zillionaire-finance.test.ts src/test/console-shell.test.tsx`: 22/22 tests passing

## Batch Q2 Completion (2026-11-21)
- Prompt V6-07 Batch Q2 Complete & Verified:
  - Removed hardcoded movie/series/channel fixtures from client viewer routes (`src/routes/live-tv.tsx`, `src/routes/library.tsx`, `src/routes/provider.disputes.tsx`).
  - Added live channel catalog fetching (`/api/public/v1/catalog/home`) and empty state (`data-testid="empty-live-channels"`) to Live TV route.
  - Added empty list initialization and empty states to user library.
  - Implemented secure owner-only endpoint `POST /api/public/v1/zillionaire/cleanup-sample`:
    - Dry-run mode (`dryRun: true`) scans Firestore collections for sample fixtures without modifying data.
    - Execution mode (`dryRun: false`) requires owner role, `permanent_delete` step-up token (`x-zillionaire-step-up`), exact confirmation text `DELETE_SAMPLE_CONTENT`, and reason text.
    - Records deleted sample documents across `channels`, `contentAssets`, `series`, `episodes`, `storageDestinations`, `storageObjects`.
    - Writes permanent audit log entry and structured report to `sampleCleanupReports/{reportId}`.
  - Added owner console UI at `/zillionaire/cleanup-sample` with dry-run scan, KPI cards, step-up MFA challenge, confirmation dialog, and direct link from Platform navigation in ConsoleShell.
  - Added CLI cleanup utility `scripts/cleanup-sample-content.mjs` with `--dry-run` and `--confirm=DELETE_SAMPLE_CONTENT` flags.
  - Gated sample storage destination seed endpoint (`POST /api/public/v1/zillionaire/storage/seed`) with `SEED_LOCKED_IN_PRODUCTION` guard in production mode.
  - Automated test suite added in `src/test/cleanup-sample.test.ts` (6 tests passing).
  - Next batch: Proceed to `Batch Q3 — Replace all storage bucket placeholders with user-configurable backend`.
