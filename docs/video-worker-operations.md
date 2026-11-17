# Video processing worker operations

## Current architecture

The existing Modal application executes jobs from the Firestore `videoTranscodeJobs` queue through the signed API. Keep this pipeline: `runner.py`, `transcode.py`, `modal_app.py`, the existing worker routes, storage destination registry, reservations, and HLS VOD output. Do not add a second queue, worker system, database, GitHub-hosted processor, or paid delivery service.

The worker is not considered production-ready until the owner deploys the current Modal app, configures its secrets, verifies a licensed test asset end to end, and confirms account-level spending controls. A source-code commit is not a deployment.

## Worker credentials

The server accepts `VIDEO_WORKER_KEYS_JSON`, a JSON object mapping each worker ID to an independent random secret of at least 48 characters. The runner sends `x-bq-worker-id` with every signed request. The server verifies the request using that worker's key, timestamp, nonce and exact-body HMAC. Nonces are stored per worker and are single-use.

A worker ID can be disabled in the Zillionaire dashboard. The server rejects disabled IDs and binds claim, heartbeat, upload-target, completion and failure requests to the exact worker that claimed the job.

The old derived `STREAMING_HMAC_SECRET` worker key is retained only as a migration fallback when no per-worker key map is configured. The server logs fallback use. Remove the worker fallback after all Modal workers use individual IDs and credentials. Playback token signing may still use `STREAMING_HMAC_SECRET` until that separate purpose is migrated.

## Modal configuration and wake-up

The existing Modal app has one resource configuration block:
- Poll/wake: 0.25 CPU, 512 MiB, 90-second timeout, one container.
- Standard processing: 2 CPU, 4 GiB, 3-hour timeout, up to two containers.
- Maintenance and wake resources are included in the same configuration block. A lighter copy-mode resource profile is defined, but the current job dispatcher does not yet route jobs to it automatically.

The queue poll fallback runs every five minutes and exits when there is no work. When a verified source upload creates a queue job, the API calls the secured Modal `wake` endpoint using `MODAL_WAKE_URL` and `MODAL_WAKE_SECRET`. If either setting is absent or the wake call fails, the scheduled fallback remains responsible for discovering queued work.

Configure `MODAL_WAKE_SECRET` in the API environment and the existing Modal secret. The endpoint accepts only the exact bearer secret. Do not expose it in browser or Android code.

## Leases, retries and attempt isolation

- A job lease defaults to 10 minutes (server setting `VIDEO_WORKER_LEASE_MINUTES`, bounded to 2–30 minutes).
- The worker renews its lease every 30 seconds through download, encode and upload, reporting the current stage and progress.
- A stale worker is rejected by heartbeat, target, completion and failure routes after its lease expires.
- Jobs receive five delayed retries: 1, 2, 4, 8 and 16 minutes. After the sixth total attempt the job becomes failed and is available for owner retry.
- Each claim increments a monotonic `attemptSequence`. Output goes to `hls/{assetId}/a{attemptSequence}/`; retries and explicit reprocessing never mix files.
- Failed or recovered attempts enqueue an idempotent `delete_attempt_prefix` maintenance task. Modal deletes objects in bounded batches using the existing storage adapter.

## Upload and completion

The worker requests up to 50 scoped upload targets per API call. The allow-list is limited to HLS playlists, media segments, init files, subtitles, thumbnails and audio renditions. Files stream from disk in chunks, with six concurrent uploads. Segments are uploaded before variant playlists and the master playlist is uploaded last. Immutable objects receive a one-year immutable cache policy at storage.

The worker never reads a whole segment into memory. Source downloads support HTTP Range resume, check expected size, verify magic bytes and SHA-256, and stop when lease renewal fails. The worker checks free disk before download, uses a private temporary directory, runs FFmpeg at lower process priority, and enforces codec, container, duration, resolution, protocol, segment-size and wall-clock limits. Error codes returned to the site are normalized; raw FFmpeg output and signed URLs are not shown to viewers.

Completion uses paginated storage listings, not one HEAD request per object. It checks exact object count, total bytes, each file size, playlist references and absence of unreferenced extra files. Only the master and variant playlists are downloaded for parsing.

## Review and publication

Successful processing sets the asset to `processed_pending_review`, not `ready`. The asset stores validation results, expected and uploaded object counts, source fingerprint, output resolutions, storage destination and owner-review requirement. The Zillionaire dashboard receives an in-app/push review notification.

The approval route requires a recent sign-in, the content permission, an audit reason, verified rights and territories, a valid age rating, a verified poster image, a valid master playlist and all segment/object checks. Producers cannot approve. Approval changes the asset to `ready`; publishing remains a separate explicit action.

## Profiles and copy mode

Each upload stores one of three profiles:
- `economy`: 360p, 480p and 720p with lower bitrates.
- `standard`: the existing standard ladder.
- `high`: higher bitrates and 1080p output where the source supports it.

The worker never upscales. An H.264 + AAC source can use HLS copy/remux mode when it fits the resolution limit. If a resulting segment exceeds 20 seconds or copy mode fails validation, the worker falls back to re-encoding. The same upload and verification path is used for both.

## Modal spend guard and usage

The application spend guard defaults on. The default monthly estimate limit is **$25**. When the estimated monthly compute total reaches the configured limit, new claims pause until the owner changes the limit or explicitly overrides the guard with an audited reason.

The estimate uses Modal's published Function rates, currently:
- CPU: **$0.0000131 per physical core-second**.
- Memory: **$0.00000222 per GiB-second**.
- Network egress: **$0.04 per GiB** beyond the plan's included allowance.

The Starter plan currently lists $30/month of included compute and 1 TiB/month included network egress. Included amounts and pricing can change; check the live [Modal pricing page](https://modal.com/pricing) and the actual workspace plan before enabling production processing. The application records per-job CPU, memory, elapsed seconds, estimated compute cost and output bytes. The output-byte total is an egress metric; it is not a billing statement. Modal's own workspace budget and billing report remain authoritative.

The estimate records completed worker jobs only; in-flight jobs can finish after the limit is reached. It may also omit some billable startup/teardown time or plan/region adjustments. Keep concurrency low and use the Modal account's actual billing report and any available workspace budget as the authoritative controls.

## HLS AES-128 protection

When the `hlsEncryption` flag is enabled, the worker generates a random 16-byte per-asset AES-128 key and encrypts HLS segments. The API wraps that key at rest with the existing versioned AES-GCM key ring. The key endpoint requires a valid, active viewing session, a fresh playback token, a funded wallet, valid content rights, territory and age eligibility. It returns only the 16-byte key with `no-store` headers.

This feature blocks casual copying of raw segments; **it is not DRM**. Keep the flag off until the key-ring settings are configured and player tests pass. A new processing version generates a new content key.

## Maintenance tasks

The existing Modal worker also claims maintenance tasks using the same per-worker signing and lease model. The first implemented task is abandoned attempt-folder deletion, performed in batches of at most 40 deletes per request to stay within the website runtime's outbound-request limits. Other maintenance types (temporary-file expiry, usage reconciliation, storage health sweeps, replication/rebalancing and monthly close) still require their task-specific idempotent handlers before they can be scheduled.

## Storage prerequisites

- Each destination must pass the owner-triggered provider health check.
- Provider usage must be reconciled; unknown usage is not treated as zero.
- Multi-bucket account groups must share the same verified account cap and free-egress budget settings across their destination records.
- Paid egress remains off unless explicitly approved for every destination in an account group.
- One asset's master playlist, renditions and segments are uploaded to the same reserved destination.

The selected profile controls the reservation factor. Actual output that exceeds its reservation is rejected and must be retried with a suitable reservation.

## Owner actions

Configure these values only in the appropriate secret manager or dashboard:
- `VIDEO_WORKER_KEYS_JSON`: worker ID → unique secret map, server and Modal.
- `MODAL_WAKE_URL`: deployed secured wake endpoint.
- `MODAL_WAKE_SECRET`: shared bearer secret, server and Modal.
- `VIDEO_WORKER_LEASE_MINUTES`: optional bounded lease duration.
- `STREAMING_URL_ENCRYPTION_KEYS_JSON` and `STREAMING_URL_ACTIVE_KEY_VERSION`: only when encrypted HLS is enabled.

Keep the Zillionaire dashboard as the only top-level control centre. Do not add or reintroduce `ADMIN_EMAIL`. Do not send secret values through chat or commit them to the repository.

## Verification status

Source tests were added, but they have not been run in the remote-only editing environment. Before production, run Vitest and Python worker tests, type-check/build, and an end-to-end test against a fake storage adapter and generated test video. Verify the deployed Modal endpoint, worker key rotation, lease recovery, review gate, spend guard and encrypted playback on supported players. Do not claim success until those checks pass.
