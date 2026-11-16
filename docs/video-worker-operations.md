# Video processing worker operations

## Current state

The repository now contains the FFmpeg queue runner and authenticated application endpoints. The container image is still only a build artifact until an owner deploys it to an always-on container host. GitHub Actions does not run a persistent worker. Until a host is deployed and polling successfully, jobs remain queued and assets cannot become ready.

## Worker container configuration

Inject these values through the container host's secret manager:

- `BQ_TV_API_BASE_URL`: HTTPS origin of the deployed BQ SQWAD TV API.
- `STREAMING_HMAC_SECRET`: the existing server secret. The worker derives a domain-separated video-worker key; do not create a second copy in source control or put it in a Docker build argument.

Optional non-secret settings:

- `WORKER_POLL_SECONDS` (default 15).
- `FFMPEG_THREADS` (default 2, maximum 8).

The container needs outbound HTTPS to the BQ SQWAD TV API and the configured private storage endpoints. Do not expose an inbound worker port. Run one worker initially and increase concurrency only after measuring CPU, RAM, temporary disk, upload throughput and API/storage limits.

## Storage usage snapshots

Provider-driven usage discovery and scheduled reconciliation are not yet implemented. An owner can submit a manual snapshot through `POST /api/public/v1/admin/storage/usage` with `destinationId`, `usageBytes` and an audit `reason`. The endpoint records the snapshot as `manual`; it does not query the provider. Refresh it after any storage changes made outside BQ SQWAD TV.

For multi-bucket account groups, set the same verified `accountCapBytes` on every destination in that account group. The router sums per-bucket usage and reservations and refuses to assign new uploads if any bucket usage or the shared account cap is unknown.

## Firestore TTL

The worker API creates one-use replay-protection documents in `videoWorkerNonces`, each with an `expiresAt` timestamp. Configure a Firestore TTL policy for collection group `videoWorkerNonces` on field `expiresAt`. Without that owner-side TTL setting, the nonce collection will grow over time. TTL deletion is asynchronous and is not part of the request security decision.

## Destination prerequisites

- Each destination must pass the owner-triggered provider health check.
- Provider usage must be reconciled; unknown usage is not treated as zero.
- Every multi-bucket account group must have the same verified `accountCapBytes` set on all its destination records. Single-bucket groups can use the bucket soft cap.
- HLS destinations require a configured `freeEgressBudgetBytes`, or the owner must explicitly enable `paidEgressEnabled`. Paid egress is off by default.
- At 70% of the monthly egress budget the destination warns; at 85% high-resolution HLS is throttled; at 95% new delivery is blocked unless paid egress was explicitly enabled.
- One asset's master playlist, renditions and segments are uploaded to the same reserved destination.

The initial HLS output reservation estimates 2.5 times the source bytes plus 10% headroom. This is a conservative starting heuristic, not a calibrated guarantee. If actual output exceeds the reservation, the API refuses to publish it and the job must be retried with an appropriately sized reservation.

## Queue lifecycle

1. The worker claims a queued job with a two-hour lease.
2. It downloads the source with a short-lived private URL.
3. The API reserves one HLS destination.
4. The worker transcodes locally and renews its lease while FFmpeg runs.
5. The worker uploads each playlist and segment through a scoped signed URL.
6. The API verifies every object size, playlist and referenced HLS resource.
7. Only then does the API set the content asset to `ready`.

Failed jobs retry up to five attempts. Worker failure codes are normalized; raw provider errors and signed URLs are not returned to viewers.

## Manual verification

The website/API CI and Android CI workflows are manual-only. The FFmpeg image workflow is also manual-only and publishes an image; it does not deploy a persistent runtime. Run the relevant workflows manually after code changes, then verify the worker host's health and process a licensed test asset end to end before enabling production uploads.
