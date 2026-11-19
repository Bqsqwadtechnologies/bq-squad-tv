# BQ SQWAD TV Backend Implementation Status

This document describes the source-code contracts currently implemented on `main`. It does not assert that Lovable runtime secrets, bucket settings, Firestore data, provider accounts, or production deployment are configured.

## Architecture

- Firebase Authentication verifies viewer, producer, and administrator identity.
- Cloud Firestore remains the application source of truth.
- Lovable Cloud Storage remains private and is accessed by server-only code.
- Money values are integer NGN minor units (kobo).
- All playback rights, wallet charges, revenue splits, and role checks are server-authoritative.
- Third-party provider playback must use a provider-specific adapter. A provider API key is encrypted before storage and is never returned to clients.

## Implemented API routes

### Playback and content
- `POST /api/public/v1/sessions/start` — verifies Android Play Integrity when applicable, checks channel/content rights and wallet, supports idempotency, creates a session, and returns a signed HLS URL.
- `POST /api/public/v1/sessions/$sessionId/heartbeat` — bills verified elapsed playback intervals transactionally.
- `POST /api/public/v1/sessions/$sessionId/end` — closes and settles a session.
- `POST /api/public/v1/sessions/$sessionId/refresh` — renews a short-lived HLS playback URL.
- `GET /api/public/v1/streaming/hls/$` — checks session, token, rights, wallet, and resource path for every HLS resource; supports HTTP Range forwarding.
- `POST /api/public/v1/storage/intent` — authorizes private source uploads and issues signed upload credentials.
- `POST /api/public/v1/storage/complete` — checks upload ownership, expiry, size, and file signature before allowing processing.
- `POST /api/public/v1/producer/channels` / `GET /api/public/v1/producer/channels` — producer channel creation and listing.
- `POST /api/public/v1/producer/channels/$channelId/assets` — submits content metadata and claimed distribution rights.
- `POST /api/public/v1/zillionaire/content-assets/$assetId/rights` — administrator rights review.
- `POST /api/public/v1/zillionaire/content-assets/$assetId/ready` — registers a verified private HLS manifest after processing.
- `POST /api/public/v1/zillionaire/channels/$channelId/publish` — publishes/unpublishes approved channels.

### Wallet and monetization
- `POST /api/public/v1/payments/paystack/initialize`
- `POST /api/public/v1/payments/paystack/verify`
- `POST /api/public/v1/payments/paystack/webhook`
- `GET /api/public/v1/wallet/google-play/products`
- `POST /api/public/v1/wallet/google-play/verify`
- `PUT /api/public/v1/zillionaire/config/pricing` / `GET /api/public/v1/zillionaire/config/pricing`

Paystack credits and Google Play credits are idempotent. Android and website payment rails remain separate.

### Platform services
- `GET /api/public/v1/ads/next`
- `GET /api/public/v1/ads/provider-config`
- `POST /api/public/v1/ads/$adId/events`
- `POST /api/public/v1/zillionaire/ads/providers`
- `POST /api/public/v1/devices/push-token`
- `GET /api/public/v1/producer/mobile-summary`

Android and website ad providers use separate Firestore configuration documents: `adProviders/android` and `adProviders/web`. Provider secrets are stored separately and encrypted. Provider-specific client SDKs still need to be wired once the actual provider names are selected.

## Firestore document contracts introduced or consumed

- `config/pricing`: `version`, `defaultRatePerMinuteMinor`, `minimumSessionBalanceMinor`, `defaultProducerShareBps`, `walletTopups`, `googlePlayProducts`.
- `channels/{channelId}`: owner, title, category, publication status, delivery mode, provider id, current asset, producer split, and rights reference.
- `contentAssets/{assetId}`: owner, channel, source path, source verification state, content metadata, delivery mode, HLS manifest path, and rights record.
- `channelProviderSecrets/{channelId}`: encrypted external provider credential only; never returned by public APIs.
- `adProviders/{android|web}`: provider id, public app id, enabled flag, and public placement identifiers.
- `adProviderSecrets/{android|web}`: encrypted provider credential.
- `sessionStartRequests/{sha256(uid:idempotencyKey)}`: idempotent session-start result.
- Existing `sessions`, `wallets`, `ledger`, `payments`, `producers`, `integrityChallenges`, and `auditLogs` documents continue to be used.

## Runtime secrets still required

Names only; never commit or paste values into source control or chat:

- `STREAMING_HMAC_SECRET` — HLS token signing.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Play Developer API and Play Integrity verification.
- `GOOGLE_PLAY_PACKAGE_NAME` — Android package verification; expected package is `com.bqsqwad.tv`.
- `STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON` — versioned 32-byte AES-GCM keyring for provider credentials.
- `STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION` — active encryption key version.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — server-side private storage access.
- Existing Firebase and Paystack secret names remain unchanged.

## Still required before production

1. Configure the runtime secrets above in Lovable Cloud.
2. Configure actual Android and website ad provider IDs, public placement IDs, and client SDKs independently.
3. Select the actual streaming provider(s) and implement their provider-specific playback adapter. Channel creation stores the provider key encrypted and sets `providerSetupStatus=CREDENTIALS_SAVED_ADAPTER_PENDING`; external channels cannot be published or played until the adapter is implemented and verified.
4. Configure a BQ-authorized transcoding/packaging pipeline that writes HLS manifests, segments, audio, and subtitle resources into the private streaming bucket. The admin readiness route verifies a manifest, but does not transcode source media.
5. Configure the `config/pricing` document with approved prices, wallet packages, and producer revenue split.
6. Confirm Lovable Storage bucket size/MIME limits and deployed runtime configuration. Source code commits do not change those settings.
7. Deploy the Lovable project and verify production runtime behavior. GitHub CI success is not a production deployment.

## Upload behavior

Supabase signed upload tokens have a provider-defined lifetime. The API records that lifetime and exposes the TUS resumable endpoint for large files when the storage URL is available. Individual signed upload tokens are not revocable; unique object paths, ownership checks, completion expiry, and private bucket access are therefore required.
