# BQ SQWAD TV — V2 File 02 implementation report

**Repository:** `Bqsqwadtechnologies/bq-squad-tv`  
**Branch:** `main`  
**Latest main commit at report creation:** `5d79322b8edb6a45b8e9fcd9b0a6403d77bb4263`  
**Work method:** direct commits to `main`; no branches, forks, PRs or history rewrites.  
**Producer code:** preserved.

## Four delivery badges

### Badge 1 — Baseline, queue and storage verification

Committed:
- Storage adapters now expose paginated `listObjects(prefix, cursor)` for the existing S3-compatible and Lovable storage adapters.
- Completion verification lists an attempt folder rather than issuing one `headObject` request per output file.
- Verification checks object count, total bytes, each worker-reported file size, playlist references, missing objects, unreferenced extras, master/variant playlist validity, and reservation limits.
- Added a fake-adapter test for 6,000 objects, intended to complete in fewer than 30 listing calls.
- Added lease-policy, exact expiry-boundary, retry schedule, nonce replay, Python/TypeScript HMAC vector, content-review prerequisite and producer-permission tests.
- The old generic role tag is no longer used to grant control-centre access. The Zillionaire owner identity is the only top-level identity; delegated access is by individual module permission.

### Badge 2 — Worker upload, leases and attempt isolation

Committed:
- Added a batch upload-target endpoint for up to 50 scoped targets per request and retained the single-target compatibility endpoint.
- Both target paths validate the attempt prefix, permitted output names and content types.
- Runner uploads use streamed file chunks, six concurrent uploads, per-file exponential retry, segment-first/playlist-next/master-last ordering, long immutable cache headers, and delete local segments only after successful upload.
- Runner no longer reads complete segment files into memory.
- Lease defaults to 10 minutes and is configurable within bounds. Heartbeats renew it while the worker downloads, encodes and uploads, reporting stage and progress.
- Lease loss stops the encode process and aborts streamed uploads; stale worker operations are rejected by the API.
- Five delayed retries are supported (1, 2, 4, 8 and 16 minutes); the sixth total attempt becomes terminal.
- Every claim increments a monotonic attempt sequence and writes to `hls/{assetId}/a{attemptSequence}/`.
- Reservations are made per attempt; failed, cancelled and recovered attempts enqueue idempotent cleanup tasks.

### Badge 3 — Review, worker identity, safety and Video Studio

Committed:
- Processing completion now sets `processed_pending_review`, stores playlist/segment/object validation results, and sends an owner review notification attempt. It no longer makes an asset ready immediately.
- Added an approval route requiring recent sign-in, content permission, an audit reason, verified rights, territory match, valid age rating, verified poster image and complete HLS validation. Producer role alone cannot approve.
- The previous manual ready route now uses the registered storage adapter and submits for review instead of bypassing the review gate.
- Added a separate explicit publish route.
- Added individual worker credentials via `VIDEO_WORKER_KEYS_JSON`, worker ID binding, per-worker nonce records, disable/enable registry checks, audited owner controls and a temporary logged legacy-key fallback.
- Added cross-language HMAC test vector coverage.
- Runner now supports resumable ranged downloads, expected-size checks, source SHA-256, free-disk checks, private temporary directories, magic-byte checks, probe/protocol/container/codec/duration/resolution limits, FFmpeg wall-clock timeouts, lower process priority and per-file size limits.
- Added economy, standard and high profiles, no-upscale behavior, H.264/AAC copy/remux with a 20-second segment fallback check, and profile-aware reservations.
- Added source hash persistence and explicit reprocess, with unique attempt folders.
- Video Studio now polls job status with ETags every five seconds and displays queue position, stage/progress, attempts, worker, heartbeat age, output resolutions, error wording, profile, estimated monthly usage, retry, cancel, approve and publish controls.
- Added owner-only worker disable controls and audited monthly spend-limit/override controls.

### Badge 4 — Modal wake, spend guard, maintenance and HLS key protection

Committed:
- Modal polling fallback changed to five minutes; a secured wake endpoint is called when an upload queues a job.
- Poll, standard processing, copy, maintenance and wake resource values are grouped in one configuration block.
- Added per-job CPU, memory, elapsed seconds, estimated compute cost and output-byte records.
- Added a default-on $25 monthly estimated compute guard and an audited owner override.
- Added a maintenance claim/run/complete flow using the same worker signature and leases. The first task implemented is bounded deletion of abandoned attempt folders.
- Added optional per-asset AES-128 HLS encryption behind `hlsEncryption`. The raw 16-byte key is generated in the worker, wrapped at rest by the existing versioned AES-GCM key ring, and served only through a short-lived viewing-session-bound route with wallet, rights, territory and age checks and `no-store` headers.
- Added the operations runbook and updated owner actions.

## Tests added

- `src/test/storage-listing.test.ts`
- `src/test/video-worker-policy.test.ts`
- `src/test/video-worker-auth.test.ts`
- `src/test/video-worker-signature.test.ts`
- `src/test/content-review.test.ts`
- `src/test/roles.test.ts`
- `src/test/streaming-source-encryption.test.ts`
- `infra/video/ffmpeg-worker/test_transcode.py`

## Verification results

<badge color="warning">Not run</badge> The remote-only GitHub editing environment did not provide a repository checkout or local Bun/Python/Gradle runtime. No test or build result is claimed.

| Check | Result |
|---|---|
| Vitest / `bun run test` | Not run — no local Bun runtime |
| TypeScript / `bun x tsc --noEmit` | Not run — no local Bun runtime |
| Website build / `bun run build` | Not run — no local Bun runtime |
| Lint / `bun run lint` | Not run — no local Bun runtime |
| Python worker tests / `pytest` | Not run — no local Python project runtime |
| End-to-end fake storage + generated video | Not run — requires executable test environment |
| Modal deployment / live wake test | Not run — no deployment or account changes made |
| Media3 and hls.js encrypted playback | Not run — requires Android/web player runtime |
| Live unauthorized API tests | Not run — no deployed endpoint was called |

## Remaining work and limits

1. **End-to-end verification is outstanding.** The source changes and tests are committed, but they must pass CI and a fake-storage generated-video simulation before production.
2. **Extra media outputs are partially complete.** Poster-frame extraction, five preview thumbnails and a five-frame sprite sheet are generated by the worker and accepted as separately classified artwork sidecars. Loudness normalization is now applied to the audio track in both copy-video and full-encode paths. WebVTT subtitle pass-through and multiple selectable audio tracks remain unimplemented. The artwork and hold-related tests have not yet run on the latest source commit.
3. **Copy-mode compute routing is not complete.** A lighter copy resource profile is defined, but the Modal dispatcher does not yet select it automatically. Standard retains the pre-existing rendition ladder; high uses higher bitrates on the 1080p rendition.
4. **Maintenance coverage is broader but not fully verified.** The existing Modal queue now has source handlers for abandoned attempt cleanup, storage health and paginated usage reconciliation, replica copy/rebalance, destination drain, seven-day old-copy cleanup, source retention, orphan scan/deletion, encrypted configuration backup, payment reconciliation and audit-chain verification. A release/yield route now lets a drain task return its lease so its queued copy task can run; destination retirement waits until old replica references are removed. Temporary-file expiry and monthly close still need task-specific handling, and the current task paths need integration tests for leases, retries, pagination and provider failures.
5. **Spend protection is an estimate, not a hard provider cap.** The app sums completed job compute records; in-flight jobs may finish after the threshold. Modal account billing and any plan-supported budget remain authoritative. Output bytes are tracked, but the app does not yet enforce an egress allowance threshold.
6. **Learn-more page integration is pending.** The Video Studio controls are present, but profile/review/block-reason Learn More sheets are not yet connected to the future pages system.
7. **Owner notification requires live verification.** The completion handler attempts in-app and push delivery; verify the owner account lookup and notification display in the deployed project.
8. **HLS AES-128 remains off by default.** Configure the existing versioned encryption key ring and test Media3 and hls.js playback before enabling the flag. This is content protection against casual copying, not DRM.
9. **Modal secrets and deployment are owner actions.** Configure worker IDs/keys and wake URL/secret in the appropriate secret managers. Do not send secret values through chat or commit them.
10. **Production review gate intentionally blocks incomplete metadata.** Assets without verified territories, age rating, poster, rights and HLS validation cannot be approved.


## Follow-up implementation on main

- `8cfa0a835044290784d061395e4a1bb24ab28643` adds worker-generated poster, five preview thumbnails and a sprite contact sheet for both copy and encode paths.
- `ab5e5792eedd1c83b1f230e07c2afff60d932a7a` and `6614c94b5ebc319f1332ec77773e578d2729f376` allow artwork sidecars through the batch upload and completion verification gates without relaxing the HLS playlist/path allow-list.
- `bf3923cc05181c085203bd45b1734e55271b7ba4` records sprite sheets separately from thumbnail media IDs.
- `efb7b09c902c05d158771985244833273af2fb1f` adds a Python unit test for the artwork output contract. It has not been run against the current source revision.
- `1ed246200c57bbb98f4523e64192a0f1bed76b15` adds EBU-style loudness normalization to both the H.264/AAC copy-video path and the full encode path; subtitle pass-through and multi-audio HLS groups remain open.
- `91bbdd5097a61a8cf6a4dd2e888d41333775ec3d` adds a lease-checked maintenance release endpoint; `78008a9657aca996ab2ab90172356157b915ad4b` makes the worker return control after yielding; `0c796e16b76ff9a434fbb0bc3ce6fa5ab3769538` prevents destination retirement while old replica references remain; `03d4b4a895348a64a8b91886ac4b052f26019103` keeps maintenance claims moving during video backlogs; and `05877b6d9f28041d90b0baf8137941d47a2d847e` adds a worker-yield regression test. These changes are source-reviewed but not yet run in CI.
- A previous GitHub verification run for commit `04e6daca8b891dfc1303679498218cb3b5dd7637` passed build, TypeScript, lint, public-text scan, Vitest, Python syntax, FFmpeg unit tests, secret scan, Android Gradle tasks and Cloudflare-reference guard. That run predates the artwork and signed-heartbeat commits and is not evidence for those later changes.

## Owner actions

See `docs/OWNER-ACTIONS.md` and `docs/video-worker-operations.md`. An adult billing owner must review Modal billing, the workspace plan and any provider-side budget before deployment or production processing. No provider credentials were added or changed by these commits.

## Next file

**V2 File 03 — Storage allowances, account caps and destination operations.** Continue directly on `main`, preserving this commit history and the existing storage registry.
