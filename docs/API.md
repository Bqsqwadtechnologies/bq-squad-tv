> **Canonical specification:** See [MASTER_TECHNICAL_SPEC.md](MASTER_TECHNICAL_SPEC.md) and [IMPLEMENTATION_BLUEPRINT.md](IMPLEMENTATION_BLUEPRINT.md). This file records the existing Android API contract; new movie/match PAYG routes must follow the canonical content, rights, hybrid-delivery and billing model. For NGN, legacy `Minor` fields mean integer kobo. New content contracts should use explicit `Kobo` names and versioned responses during migration.

# BQ SQWAD TV API contract (Android client)

## Contract status
This is the shared client integration contract, not evidence of a deployed production API. Route source now exists under src/routes/api/public/v1, but production readiness still requires deployment and live integration tests. Never expose stream URLs or billing mutations directly from Firestore/client code.

Base URL: `API_BASE_URL` from Android local.properties. All routes use HTTPS and Firebase ID-token bearer authentication unless stated otherwise. JSON fields are camelCase. Money operations must be idempotent and atomic.

## Authentication and web sessions

- Firebase Authentication remains the identity provider. Protected API routes verify signed Firebase ID tokens.
- `POST /v1/auth/email/send-code` — bearer-authenticated; sends a six-digit Brevo email-verification code. Codes expire after 10 minutes, are stored as hashes, and are rate-limited.
- `POST /v1/auth/email/verify-code` — bearer-authenticated; body `{code}`; consumes the code once and records application-level email verification against the authenticated UID and current email claim.
- `POST /v1/auth/web/session` — same-origin only; body `{idToken,refreshToken}`; validates both credentials belong to the same Firebase UID, then places the rotated refresh token in an HttpOnly, Secure, SameSite=Lax cookie. The browser receives a short-lived ID token.
- `POST /v1/auth/web/session/refresh` — same-origin only; rotates the refresh token cookie and returns a fresh short-lived ID token.
- `POST /v1/auth/web/session/logout` — same-origin only; revokes the server-tracked refresh-token session and clears the browser cookie. If Firestore revocation fails, the endpoint returns 503 while still clearing the local cookie.
- `GET /v1/auth/web/me` — bearer-authenticated; returns the signed-in account identity and effective email-verification state.
- `GET /v1/auth/web/config` — public configuration containing only the Google OAuth Web Client ID, never a client secret.
- Website Google sign-in uses Google Identity Services and Firebase Identity Toolkit. The Google provider and authorized domains must be enabled in Firebase/Google Cloud.
- Password recovery currently uses Firebase's standard password-reset email flow. A Brevo six-digit password-reset flow is not yet implemented.

These endpoints are implemented in source. They are not considered production-ready until the hosting deployment is published and live email, cookie, OAuth, expiry, rate-limit and cross-platform tests pass.

## Profile and age policy
- `POST /v1/profile/complete` — body `{dateOfBirth,parentalPin}`; returns `{profileComplete,adultEligible,parentalPinEnabled}`. The server validates a real, non-future date and calculates age; never trust client age. Profile completion alone does not verify identity or age and must never grant adult access.
- Adult eligibility requires both trusted server-side `adultAgeVerified` and `adultIdentityVerified` records, a valid date of birth showing the user is at least 18, and the server-derived `adultEligible` flag. These verification flags may only be set by a future approved verification-provider integration or a tightly authorized server-side review workflow; clients must never be able to set them.
- Until an adult identity/age verification provider and its server callback/review workflow are implemented and live-tested, adult-only channels remain unavailable to everyone. Under-18 and unverified users receive no adult-channel metadata, verification invitation, or playback URL.
- Re-check adult eligibility on catalog, search, channel detail, ad targeting and session start.

## Catalog
- `GET /v1/catalog/home` — returns `{liveNow,startingSoon,channels,replays,continueWatching,trending}`. Channel summary: `{id,title,category,posterUrl,isLive,currentProgramme,language}`.
- `GET /v1/catalog/search?q=&type=&category=&language=` — returns `{results:[ChannelSummary]}`; adult filtering happens before results are returned.
- `GET /v1/channels/{channelId}` — returns `{channel,schedule,replays}`; enforce rights, geo and age checks.

## Channel schedules
- `POST /v1/producer/channels/{channelId}/schedule` — requires the channel's `schedule.write` permission; creates or updates a programme using `programmeId?`, `title`, `description?`, `startsAt`, `endsAt`, `contentAssetId?` and `reason?`.
- `DELETE /v1/producer/channels/{channelId}/schedule/{programmeId}` — requires `schedule.write` permission.
- `POST /v1/admin/channels/{channelId}/schedule` and `DELETE /v1/admin/channels/{channelId}/schedule/{programmeId}` — require the Admin `channels` module.
- Schedule writes use a Firestore transaction-backed reservation index, reject overlapping time ranges, allow adjacent programmes, and audit create/update/delete operations. Existing schedule entries are indexed on first write; channels with more than 300 legacy entries require a controlled migration.

## Integrity and sessions
- `GET /v1/security/integrity/challenge` — returns a fresh one-use `{nonce}`.
- `POST /v1/sessions/start` — body `{channelId,contentAssetId?,clientPlatform,integrityNonce?,integrityToken?,idempotencyKey}`. All requests require Firebase auth, age policy, content rights, geo/territory checks and wallet minimum. An atomic active-session lease enforces the configured concurrent session limit (default 2, configurable from 1–5 in Admin Pricing). Android and Android TV require a fresh Play Integrity token plus a one-use challenge. Web requires a same-origin request and a matching HttpOnly web-session cookie. Return `{sessionId,playbackUrl,ratePerMinuteMinor,walletBalanceMinor,currency,timeRemainingSeconds,sessionTotalMinor,active}`. Playback URL must be signed and short-lived.
- `POST /v1/sessions/{sessionId}/heartbeat` — body `{clientSequence,playbackState,playbackPositionMs}`. playbackState is one of playing, paused, buffering, idle or ended; playbackPositionMs is the Media3 media position. The server uses its own clock and bills only a completed interval where both consecutive player samples report playing, media position advanced, and advancement does not exceed server elapsed time. Paused, buffering, idle, ended, unchanged-position and stale-heartbeat intervals are not charged. Idempotency is session + sequence. Expected cadence: 15 seconds. Client-reported player telemetry is not cryptographic proof; verified Play Integrity and provider-side authorization/telemetry remain production requirements.
- `POST /v1/sessions/{sessionId}/end` — close the session and revoke playback authorization. It does not charge an unconfirmed trailing interval after the last heartbeat; only completed playback-evidence intervals are billable.
- More than 45 seconds without a heartbeat or reaching the wallet/daily spend limit terminates the session server-side. A configurable concurrent-device cap is not yet implemented.

## Wallet and Google Play
- `GET /v1/wallet` — `{balanceMinor,currency,dailySpendLimitMinor,spentTodayMinor}`.
- `GET /v1/wallet/ledger?limit=25&cursor=` — `{items:[{id,description,amountMinor,createdAt,kind}],nextCursor}`. `limit` is 1–100 (default 25); `nextCursor` is opaque and may be null. The server filters by the authenticated user's `uid` and orders by `createdAt` plus document id, newest first.
- `GET /v1/wallet/google-play/products` — `[{productId,title,credits,description}]`; IDs must match Play Console consumables.
- `POST /v1/wallet/google-play/verify` — body `{productId,purchaseToken,orderId,packageName}`; verify Google Play Developer API, package, configured product, purchase state, SHA-256 obfuscated Firebase account binding, supported quantity and idempotency before crediting. Return `{credited,processed,balanceMinor,currency,message}`. Android consumes only after `processed=true`, including a verified purchase already credited to the same account. Refund/revocation reconciliation remains a separate task.
- Paystack initialization/webhooks are web-only. Android must not use Paystack for digital credits.

### Website wallet and Paystack

- `GET /v1/wallet/topups` — authenticated; returns configured public package IDs with integer-kobo amounts and credits.
- `POST /v1/payments/paystack/initialize` — authenticated with verified email; body `{packageId}`; creates a server-owned pending payment and returns a Paystack hosted `authorizationUrl`. The default return route is `/wallet`.
- `POST /v1/payments/paystack/verify` — authenticated; body `{reference}`; independently verifies the transaction with Paystack before an idempotent wallet credit.
- `POST /v1/payments/paystack/webhook` — Paystack HMAC-SHA512 signature required; the server re-verifies the transaction with Paystack before crediting.
- Paystack is the website payment provider only. Android digital wallet credits use Google Play Billing and server-side Google Play verification.

## Ads, push and producer
- `GET /v1/ads/next?platform=&channelId=&slot=` — eligible campaign creative or null. The server filters active status, platform, placement, dates, channel targeting, viewer age eligibility, campaign age rating, restricted categories and configured territory codes. Under-18 or age-unknown profiles do not receive adult-rated or unrated campaigns. Frequency caps and campaign-priority enforcement remain incomplete.
- `POST /v1/ads/{adId}/events` — `{event,positionSeconds,platform,slot}`; event values: impression, start, quartile_25, quartile_50, quartile_75, complete, skip, click.
- `POST /v1/devices/push-token` — `{token,platform:"android"|"web",deviceName?}`; token is stored under the authenticated user's device collection.
- `GET /v1/notifications` — authenticated user's latest 50 notification records; returns only that user's inbox.
- `POST /v1/notifications/{notificationId}/read` — marks one of the authenticated user's own notifications as read.
- `POST /v1/admin/notifications` — requires the Admin `notifications` module; sends a title/body and optional same-site deep link to up to 25 explicitly selected user UIDs. The UUID idempotency key prevents duplicate inbox entries for the same administrator/recipient request. FCM delivery requires the existing Firebase service account to have Firebase Cloud Messaging send permission.
- `GET /v1/producer/mobile-summary` — `{producerStatus,earningsBalanceMinor,earningsLifetimeMinor,currency,channelCount,publishedChannelCount,channels}`; enforce producer role on server.

## Remaining Phase 2 security work

- Configure and verify Firebase App Check for Android and website APIs. Play Integrity is currently enforced specifically by Android playback start; it is not a substitute for App Check across every API.
- Add Google Play refund/revocation reconciliation and operational retry monitoring for failed consumption.
- Add complete web wallet checkout UI and live Paystack test-mode verification.
- Complete age, geography, frequency caps and priority rules for ad delivery.
- Validate FCM delivery in the Firebase project, including service-account permission and Android notification-channel behavior; invalid unregistered device tokens are marked inactive.

## Security
Firebase clients must not write wallets, balances, ledgers, sessions, revenue allocations, producer earnings, payouts, roles or purchase verification outcomes. Firestore rules must default-deny sensitive collections; server uses Firebase Admin credentials stored only in Lovable Cloud. Never accept client-supplied price, balance, age eligibility, role, revenue split or elapsed session time.
