# BQ SQWAD TV — Runtime Integration Setup

This document distinguishes source-code implementation from runtime credentials and third-party provider activation. Do not commit credentials or paste them into GitHub issues, chat, or source files.

## Core authority

- Firebase Authentication is the user identity authority.
- Cloud Firestore is the only application database for users, channels, content assets, sessions, wallets, ledger entries, payments, provider configuration, audit records, and rate limits.
- Lovable Cloud Storage is private media object storage only. Keep `bq-sqwad-source-media` and `bq-sqwad-streaming-media` private and keep client-facing storage policies disabled.
- Lovable Cloud PostgreSQL is not an application database.
- The current hosting preset is managed by Lovable. Do not add Cloudflare products or replace the existing preset.

## Runtime secrets still required

Configure these in the hosting provider's server-side secret settings. Never expose them through `VITE_*` variables.

| Secret | Purpose | Required when |
| --- | --- | --- |
| `STREAMING_HMAC_SECRET` | Signs short-lived, session/user/path-bound HLS resource tokens | Before BQ-hosted playback is enabled |
| `STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON` | Versioned AES-256 keyring; JSON object of key-version to 32-byte base64url key | Before storing external streaming provider keys or ad-provider secrets |
| `STREAMING_PROVIDER_CREDENTIALS_ACTIVE_KEY_VERSION` | Active key version, e.g. `v1` | Same as above |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Google Play Developer API service account with Android Publisher access | Before Play purchase verification |
| `GOOGLE_PLAY_PACKAGE_NAME` | Android application ID; expected `com.bqsqwad.tv` | Before Play verification; code has a default |
| `PAYSTACK_SECRET_KEY` | Server-side Paystack initialization and verification | Before Paystack checkout |
| `PAYSTACK_PUBLIC_KEY` | Public checkout integration key | When the website checkout UI is enabled |
| `PAYSTACK_CALLBACK_URL` | Trusted website return URL for Paystack | Before website checkout |

The encryption keyring must contain at least one 32-byte random key encoded as unpadded base64url (43 characters). The active version must exist in the JSON map. Keep old key versions during rotation so previously encrypted provider credentials remain decryptable. Add a new version, switch the active version, migrate/re-encrypt stored credentials, and only then retire an old version.

The HMAC secret should be a separate high-entropy random secret. Do not reuse the provider credential encryption key.

Existing Firebase and storage integration secrets remain server-only:
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `ADMIN_EMAIL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_URL` or the hosting-managed `VITE_SUPABASE_URL`

## Streaming provider setup

Producer channel creation accepts:
- `deliveryMode = bq_hosted`: source upload and BQ-controlled HLS processing.
- `deliveryMode = external`: a provider ID and provider API key.

For external channels, the API encrypts the submitted key with AES-256-GCM and stores only the ciphertext, nonce, algorithm, and key version in the Firestore server-only collection `channelProviderSecrets`. The credential is never returned by channel listing APIs.

A channel created with an external provider is intentionally marked `CREDENTIALS_SAVED_ADAPTER_PENDING`. It cannot be published or played until a provider-specific adapter is implemented and verified. Each provider has a different API, authentication scheme, manifest authorization process, token refresh behavior, and rights model. Do not proxy, ingest, or rewrite a third-party provider's stream unless its contract and API explicitly authorize that behavior. The adapter must return a provider-authorized viewer-scoped playback URL, protocol, expiry, optional DRM details, and approved request headers.

## Advertising providers — separate by client

The platform stores independent configurations:
- Android app: `adProviders/android`
- Website: `adProviders/web`

Admin configuration is written through `POST /api/public/v1/zillionaire/ads/providers`. The public configuration endpoint is `GET /api/public/v1/ads/provider-config?platform=android` or `?platform=web`. Only public SDK identifiers and placement IDs are returned. Private provider credentials are encrypted in `adProviderSecrets/{platform}`.

Do not assume the Android and website use the same ad vendor or SDK. A provider-specific SDK adapter is still required for each selected vendor. The app and website should load only their own platform configuration. Campaign/event delivery through `/ads/next` and `/ads/{adId}/events` is the platform's first-party campaign path and is distinct from a vendor SDK integration.

## API implementation map

- Sessions: `POST /sessions/start`, heartbeat, end, and refresh.
- Storage: `POST /storage/intent` and `POST /storage/complete`.
- BQ-hosted HLS: `GET /streaming/hls/*` with per-resource signed tokens, active session checks, rights checks, and Range forwarding.
- Paystack: initialize, verify, and webhook.
- Google Play: products and purchase verification.
- Ads: next, event tracking, public provider config, and admin provider config.
- Devices: push token registration.
- Producer: channel creation/listing, asset metadata, and mobile summary.

## Release gate

A successful GitHub CI run verifies repository checks only. It does not prove that runtime secrets exist, that a Play service account has the required permissions, that Paystack webhooks are configured, that storage bucket limits are set, that a provider adapter is licensed/working, or that the application is published. Verify those separately before production launch.
