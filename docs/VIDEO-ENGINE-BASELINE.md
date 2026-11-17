# File 02 — video engine baseline

Date: 2026-11-17
Repository: `Bqsqwadtechnologies/bq-squad-tv`
Branch: `main`
Baseline tree inspected: `6e0daa42725d41c820e1a7f7affb47973bec0028`

## Read-first documents

The File 00 foundation record, decisions and owner-action checklist were read before File 02 changes:
- `docs/AUDIT.md`
- `docs/DECISIONS.md`
- `docs/OWNER-ACTIONS.md`
- `docs/STREAMING.md`
- `docs/STORAGE-REGISTRY.md`
- `docs/video-worker-operations.md`

## Existing pipeline retained

The implementation remains on the existing Modal worker, `infra/video/ffmpeg-worker/runner.py`, `transcode.py`, `modal_app.py`, Firestore `videoTranscodeJobs`, existing `claim`, `heartbeat`, `target`, `complete`, and `fail` routes, existing storage destination registry, reservation ledger, and HLS VOD output. No second queue or worker framework was introduced.

## Baseline findings verified in source

1. Completion immediately set content to `ready`; no separate owner review state existed.
2. Completion called `headObject` once for each output object.
3. The runner requested one upload target per file and loaded each file with `read_bytes()`.
4. The lease was two hours and heartbeat only ran around FFmpeg, not download/upload.
5. Output prefix was shared as `hls/{assetId}`, allowing retries to collide.
6. The manual ready endpoint imported the Supabase client directly instead of using the storage adapter.
7. Worker authentication used a derived shared `STREAMING_HMAC_SECRET` key, with timestamp and nonce replay protection.
8. Download and transcode lacked resumable download, disk guard, protocol whitelist, wall-clock timeout and per-file limits.
9. Modal polled every 30 seconds on a small scheduled function.
10. Destination seeding is separately bounded; this file does not change the File 03 storage allowance controls.

## Tests present and added

Existing Python worker tests in `infra/video/ffmpeg-worker/test_transcode.py` cover canonical signing message formatting, rendition selection without upscaling, and local HLS output validation.

Added Vitest coverage:
- `src/test/video-worker-policy.test.ts`: ten-minute lease policy, retry backoff (1, 2, 4, 8, 16 minutes), terminal retry count, and retry eligibility.
- `src/test/storage-listing.test.ts`: 6,000 fake objects are collected in six listing calls (under 30), plus duplicate/out-of-prefix rejection.

## Required tests not yet covered

The following integration-level tests are not yet present and remain required before production:
- Firestore claim transaction contention and expired-lease recovery.
- Worker nonce replay against a transactional Firestore fake.
- Stale worker heartbeat, fail and completion rejection after lease expiry.
- Retry count and `nextAttemptAt` persisted through actual route handlers.
- Completion route full fake-provider verification, including 6,000 objects and playlist reference integrity.
- Ready/approval route authorization, rights, territory, age, poster and validation prerequisites.
- Cross-language Python-to-TypeScript signature verification.
- End-to-end generated test video with a fake storage adapter.

## Execution results

No tests were executed in this remote-only editing session. The GitHub connector can read and commit repository files, but it does not provide a checked-out working tree, Bun/Vitest runtime, Python environment, FFmpeg binary, Modal deployment, Firebase test project or browser. Therefore:
- Vitest: **not run** — no local Bun/Vitest runtime.
- Python `unittest`: **not run** — no local Python/FFmpeg runtime.
- TypeScript build/type-check: **not run** — no local repository checkout/runtime.
- Live Firestore/storage/Modal tests: **not run** — no test deployment was invoked.

A test file being committed is not evidence that it passes. Run the suites in CI before enabling this pipeline in production.
