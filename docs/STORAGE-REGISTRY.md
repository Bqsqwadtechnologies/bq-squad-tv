# BQ SQWAD TV storage destination registry

This document describes the first storage-registry implementation slice.

## Non-negotiable boundaries

- The existing `bq-sqwad-source-media` and `bq-sqwad-streaming-media` buckets remain in place.
- Firebase Firestore remains the application metadata database.
- Firestore stores destination metadata only. Credentials stay in server environment secrets.
- A bucket is not assumed to have free capacity merely because a configured soft cap exists.
- Unknown provider usage is not treated as zero and cannot be used for automatic capacity routing.
- This registry does not create buckets, move objects, perform uploads, or verify provider billing quotas.

## Firestore document

Collection: `storageDestinations`

Document ID: `destinationId`

Fields:
- `providerType`: `lovable_storage` or `backblaze_b2`
- `accountAlias`: non-secret operator label
- `secretPrefix`: environment-variable prefix only
- `bucketName`: provider bucket name
- `region`: provider region
- `purpose`: source_media, hls_streaming, posters, thumbnails, downloads, temporary, or backup
- `softCapBytes`: owner-configured safety ceiling
- `dailyEgressCapBytes`: optional owner-configured ceiling
- `priority`: lower values are preferred
- `enabled`: routing enablement
- `createdAt`, `updatedAt`, `updatedBy`: audit metadata

## Server secret conventions

For a Lovable/Supabase Storage destination:
- `<PREFIX>_URL`
- `<PREFIX>_SERVICE_ROLE_KEY`

For Backblaze B2:
- `<PREFIX>_KEY_ID`
- `<PREFIX>_APP_KEY`
- `<PREFIX>_BUCKET_ID`
- `<PREFIX>_ENDPOINT`

B2 endpoints must use HTTPS and a Backblaze B2 S3 endpoint hostname. Secrets are resolved only in server code and are never returned by the registry API.

## API

Owner-only, `system` module:
- `GET /api/public/v1/admin/storage/destinations`
- `PUT /api/public/v1/admin/storage/destinations`

The PUT operation registers or updates non-secret metadata and records an audit event. A response of `configured` means required environment variables are present and syntactically valid; it is not a live provider health check.

## Routing status

Automatic routing remains disabled until a provider adapter can:
1. Authenticate to the provider.
2. Verify bucket identity.
3. Report actual usage or a safe usage estimate.
4. Upload and verify an object.
5. Read or sign an authorized object.
6. Delete an object where permitted.

Do not use `softCapBytes` as proof of provider quota. Provider quotas, free-tier rules, billing and egress must be checked independently. The registry deliberately fails closed when usage is unknown.
