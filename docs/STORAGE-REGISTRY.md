# BQ SQWAD TV storage destination registry

This document describes the current storage federation implementation and its production gates.

## Non-negotiable boundaries

- The existing `bq-sqwad-source-media` and `bq-sqwad-streaming-media` buckets remain in place for legacy assets.
- Firebase Firestore remains the application metadata database.
- Firestore stores destination metadata only. Credentials stay in server environment secrets.
- A configured soft cap is an application safety ceiling, not proof of provider quota or free capacity.
- Unknown usage, unknown shared account capacity or unknown HLS egress is not treated as zero.
- Adding a destination does not create a bucket, verify its billing allowance, copy data or prove it is healthy.
- A complete movie ladder must stay in one destination; never distribute one title's HLS files across unrelated buckets.
- Never expose private bucket URLs, signed URLs or provider credentials to viewers.

## Destination metadata

Collection: `storageDestinations`; document ID: `destinationId`.

Important fields include provider type, account alias, secret prefix, bucket name, region, purpose, soft cap, shared account cap, account group, mode, priority, health state, usage snapshot, monthly egress budget, paid-egress approval, daily egress cap and audit timestamps.

Every bucket belonging to the same provider account/workspace must use one identical `accountGroup`. For multi-bucket groups, set the same verified `accountCapBytes` on every destination. Set the same verified `freeEgressBudgetBytes` and `paidEgressEnabled` on every destination in the group. Never multiply an account-level allowance by its bucket count.

## Secret naming

Lovable/Supabase Storage:
- `<PREFIX>_URL`
- `<PREFIX>_SERVICE_ROLE_KEY`

Backblaze B2:
- `<PREFIX>_KEY_ID`
- `<PREFIX>_APP_KEY`
- `<PREFIX>_BUCKET_ID`
- `<PREFIX>_ENDPOINT`

Both B2 prefix conventions are accepted: `STORAGE_B2_NN01`…`STORAGE_B2_NN10` and `STORAGE_B2_01`…`STORAGE_B2_11`. Do not assume they represent 21 distinct accounts. Add credentials only through the hosting provider's secret manager.

## Owner-only storage API

All routes below require the verified platform owner and the `system` module.

- `GET /api/public/v1/zillionaire/storage/destinations`: list redacted destination metadata.
- `PUT /api/public/v1/zillionaire/storage/destinations`: create/update metadata and audit the change.
- `POST /api/public/v1/zillionaire/storage/seed`: seed metadata only; it does not create buckets or verify quota.
- `POST /api/public/v1/zillionaire/storage/health`: perform a private write/head/read/delete health check and audit the result.
- `POST /api/public/v1/zillionaire/storage/usage`: record an owner-attested manual usage snapshot with an audit reason. This is not automatic provider discovery.

The owner Storage Destinations page exposes metadata editing, legacy bucket seeding, provider health checks, manual usage reporting, shared capacity and shared egress configuration. A successful configuration check only means the required secret values are present and syntactically valid; the separate live health check must pass.

## Routing and reservations

The server selects destinations by purpose, active mode, enabled state, configured credentials, healthy status, known usage, bucket soft cap and shared account cap. Multi-bucket groups require a common verified account cap on every member. Upload and HLS reservations are written transactionally with the routing cursor.

HLS reservations require a shared account-group egress budget or explicit paid-egress approval. Monthly egress is recorded in `storageAccountEgress`, shared across all buckets in the account group. Daily egress caps remain per bucket. Thresholds are:
- 70%: warn.
- 85%: throttle high-resolution delivery.
- 95%: block delivery unless paid egress is explicitly enabled for the entire account group.

The owner must set consistent account-group egress settings on all destinations. Inconsistent or unknown settings fail closed.

## Provider adapters and upload/streaming

The current adapters support private object write/read/head/delete and owner-triggered health checks for registered B2 and Lovable destinations. Upload intents and HLS delivery resolve the destination assigned to each asset; legacy assets continue to resolve to their original Lovable buckets. HLS output is verified before an asset becomes ready.

Current large-source upload is a single signed PUT. Multipart/resumable upload is not implemented. The 5 GB intent limit is not a promise that every browser, provider or hosting path can reliably upload a 5 GB file.

## Implemented File 03 capabilities and remaining gates

- Credential bundles, discovery by secret name, and bulk registration are implemented. Secret values are never returned by discovery.
- The compact pool index and transactional reservations support large pools; pool shards contain at most 200 entries.
- Modal maintenance tasks support provider health checks and paginated usage listing. They are queued through the existing video maintenance worker.
- Asset bindings preserve the legacy source and streaming locations. Verified replica-copy tasks copy media first, playlists next and the master playlist last, then compare the complete listing before binding.
- Owner endpoints and the Storage Destinations screen expose registration, health, usage, drain/retire and replica controls.
- Expected delivery is reserved at playback grant and extended during session heartbeats. The segment path does not read account-wide counters. Paid delivery is forced off.

Production gates still requiring implementation or verification:
- Automated promotion by watch time and complete hot-replica lifecycle tests.
- A complete crash-safe rebalance/drain worker with copy-switch-delete checkpoints.
- Three-clean-check recovery and playback failover across healthy replicas, including posters and thumbnails.
- Full lifecycle cleanup with two-pass orphan confirmation and retention pinning.
- Encrypted weekly configuration backup, retention of eight copies, and tested restore.
- Complete virtualised owner screen verification at 300+ destinations.
- End-to-end tests and CI results for all new code, including concurrent reservations and maintenance failure recovery.
- Owner-side verification of all live secrets, account groups, free allowances and provider health.

Do not enable production movie uploads until these gates are implemented and verified. See [production readiness](production-readiness.md) and [worker operations](video-worker-operations.md).
