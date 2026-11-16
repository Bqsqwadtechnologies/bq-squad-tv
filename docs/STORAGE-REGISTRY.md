# BQ SQWAD TV storage destination registry

This document describes the storage registry and the safe, staged rollout of storage federation.

## Non-negotiable boundaries

- The existing `bq-sqwad-source-media` and `bq-sqwad-streaming-media` buckets remain in place and are the permanent fallback for legacy assets.
- Firebase Firestore remains the application metadata database.
- Firestore stores destination metadata only. Credentials stay in server environment secrets.
- A configured soft cap is an application safety ceiling, not proof of provider quota or free capacity.
- Unknown usage or unknown streaming egress is not treated as zero.
- Adding a destination to the registry does not create a bucket, verify its billing allowance, copy data, or prove it is healthy.
- Storage routing must remain disabled until real provider health, object upload/read/delete and usage checks pass.
- A complete movie ladder must stay in one destination; never distribute a single title's HLS files across unrelated buckets.

## Firestore document

Collection: `storageDestinations`

Document ID: `destinationId`

Existing fields:
- `providerType`: `lovable_storage` or `backblaze_b2`
- `accountAlias`: non-secret operator label
- `secretPrefix`: environment-variable prefix only
- `bucketName`: provider bucket name used for object operations
- `region`: provider region
- `purpose`: source_media, hls_streaming, posters, thumbnails, downloads, temporary, or backup
- `softCapBytes`: owner-configured safety ceiling
- `dailyEgressCapBytes`: optional owner-configured ceiling
- `priority`: lower values are preferred
- `enabled`: routing enablement
- `createdAt`, `updatedAt`, `updatedBy`: audit metadata

The routing selector in `src/lib/server/storage/routing.ts` is a pure, tested selection function. It filters by purpose, active mode, healthy/configured state, known usage, destination capacity, account-group capacity and (for HLS) known egress headroom. Firestore cursor persistence and provider adapters are not yet connected to upload or playback routes.

## Secret naming compatibility

For a Lovable/Supabase Storage destination:
- `<PREFIX>_URL`
- `<PREFIX>_SERVICE_ROLE_KEY`

For Backblaze B2:
- `<PREFIX>_KEY_ID`
- `<PREFIX>_APP_KEY`
- `<PREFIX>_BUCKET_ID`
- `<PREFIX>_ENDPOINT`

Both numbered conventions are accepted by the registry as prefixes:
- Earlier inventory: `STORAGE_B2_NN01` through `STORAGE_B2_NN10`.
- Prompt 2 convention: `STORAGE_B2_01` through `STORAGE_B2_11`.

Do not assume both naming schemes refer to eleven unique accounts. The owner must register the actual destination and provide its secrets in the hosting secret manager. B2 endpoints must use HTTPS and a Backblaze B2 S3 endpoint hostname. The B2 bucket name in destination metadata is the S3 object bucket name; the `_BUCKET_ID` secret is retained for account/bucket identity checks. Never expose credentials in API responses or logs.

## Provider quota and cost facts

Official Backblaze pricing was checked on **16 November 2026**:
- The first 10 GB of stored data is free per B2 account, not per bucket.
- Standard B2 egress is free up to 3x the account's average monthly stored data; additional egress is listed at $0.01/GB.
- Egress to eligible partner CDNs/compute providers may be free beyond the standard allowance, subject to the provider's terms.
- Current published storage pricing starts at $6.95/TB/month after the free allowance. Prices and regional details can change.

Source: [Backblaze B2 official pricing](https://www.backblaze.com/cloud-storage/pricing).

The 10 GB free storage allowance must not be multiplied by the number of buckets belonging to the same account. For B2 egress, the allowance is account-level and based on average stored data over the billing cycle; a simple current-usage estimate is only a conservative application guard, not an exact invoice calculation.

Lovable buckets in the same workspace may share one storage quota. Until the workspace quota and billing model are verified in the actual account, destinations belonging to that workspace must share an `accountGroup` and must not be counted as independent free capacity. The reported 328 buckets / 1.64 TB and 338-bucket / 1.74 TB totals are unverified inventory claims, not enabled capacity.

## API and current implementation status

Owner-only, `system` module:
- `GET /api/public/v1/admin/storage/destinations`
- `PUT /api/public/v1/admin/storage/destinations`

The PUT operation registers or updates non-secret metadata and records an audit event. A response of `configured` means required environment variables are present and syntactically valid; it is not a live provider health check.

Implemented in this batch:
- Pure capacity-aware priority/round-robin selection.
- Unknown usage and unknown HLS egress fail closed.
- 10% reservation overhead helper for estimated output size.
- B2 3x egress budget helper with an 80% safety factor.
- 70% / 85% / 95% egress state calculation.
- Tests for rotation, wraparound, full destinations, health/mode filtering, priority fallback, shared account caps, unknown usage and egress thresholds.
- Registry secret-prefix tests for both naming conventions.

Not yet implemented or activated:
- Real B2 and Lovable provider adapters and live health checks.
- Transactional Firestore cursor persistence and concurrency tests.
- Account-group usage aggregation and sharded storage/egress ledgers.
- Upload-target gating and wiring existing upload/processing/playback routes through adapters.
- Multipart B2 upload, owner seed action, full owner controls, source cleanup and replica jobs.
- Real provider quota reconciliation and billing verification.

Do not mark a destination healthy or route production uploads to it until its real adapter health test has passed. Until then, legacy upload and playback paths remain unchanged.

