# BQ SQWAD TV API contract (Android client)

## Contract status
This is the Android integration contract, not evidence of deployed endpoints. Repository audit on 2026-11-08 found no Lovable Cloud edge-function source, no Supabase/functions directory, no Firestore rules, and no existing API/Billing docs. These routes must be implemented and deployed in Lovable Cloud before production flows work. Never expose stream URLs or billing mutations directly from Firestore/client code.

Base URL: `API_BASE_URL` from Android local.properties. All routes use HTTPS and Firebase ID-token bearer authentication unless stated otherwise. JSON fields are camelCase. Money operations must be idempotent and atomic.

## Profile and age policy
- `POST /v1/profile/complete` — body `{dateOfBirth,parentalPin}`; returns `{profileComplete,adultEligible,parentalPinEnabled}`. Calculate age on the server; never trust client age.
- Re-check adult eligibility on catalog, search, channel detail, ad targeting and session start. Under-18 users receive no adult content metadata or playback URL.

## Catalog
- `GET /v1/catalog/home` — returns `{liveNow,startingSoon,channels,replays,continueWatching,trending}`. Channel summary: `{id,title,category,posterUrl,isLive,currentProgramme,language}`.
- `GET /v1/catalog/search?q=&type=&category=&language=` — returns `{results:[ChannelSummary]}`; adult filtering happens before results are returned.
- `GET /v1/channels/{channelId}` — returns `{channel,schedule,replays}`; enforce rights, geo and age checks.

## Integrity and sessions
- `GET /v1/security/integrity/challenge` — returns a fresh one-use `{nonce}`.
- `POST /v1/sessions/start` — body `{channelId,integrityToken,idempotencyKey}`. Verify Play Integrity, auth, age, content rights, geo, wallet minimum and concurrent-device limit. Return `{sessionId,playbackUrl,ratePerMinuteMinor,walletBalanceMinor,currency,timeRemainingSeconds,sessionTotalMinor,active}`. Playback URL must be signed and short-lived.
- `POST /v1/sessions/{sessionId}/heartbeat` — body `{clientSequence}`. Server uses its own clock, charges elapsed seconds atomically, returns the session snapshot. Idempotency key is session + sequence. Expected cadence: 15 seconds.
- `POST /v1/sessions/{sessionId}/end` — settle to exact server second, revoke token and close session. Idempotent.
- Two missed heartbeats, zero balance, policy revocation or concurrent-session violation terminate the session server-side.

## Wallet and Google Play
- `GET /v1/wallet` — `{balanceMinor,currency,dailySpendLimitMinor,spentTodayMinor}`.
- `GET /v1/wallet/ledger` — `{items:[{id,description,amountMinor,createdAt,kind}]}`.
- `GET /v1/wallet/google-play/products` — `[{productId,title,credits,description}]`; IDs must match Play Console consumables.
- `POST /v1/wallet/google-play/verify` — body `{productId,purchaseToken,orderId,packageName}`; verify Google Play Developer API, package, product, purchase state, quantity, refunds and idempotency before crediting. Return `{credited,balanceMinor,currency,message}`. Android consumes only after `credited=true`.
- Paystack initialization/webhooks are web-only. Android must not use Paystack for digital credits.

## Ads, push and producer
- `GET /v1/ads/next?channelId=&slot=` — eligible ad or null after age, geo and frequency rules.
- `POST /v1/ads/{adId}/events` — `{event,positionSeconds}`; event values: impression, quartile_25, quartile_50, quartile_75, complete, skip.
- `POST /v1/devices/push-token` — `{token,platform:"android"}`.
- `GET /v1/producer/mobile-summary` — `{approved,roleTags,channelCount,liveViewers,watchSeconds,earningsMinor,currency}`; enforce producer role on server.

## Security
Firebase clients must not write wallets, balances, ledgers, sessions, revenue allocations, producer earnings, payouts, roles or purchase verification outcomes. Firestore rules must default-deny sensitive collections; server uses Firebase Admin credentials stored only in Lovable Cloud. Never accept client-supplied price, balance, age eligibility, role, revenue split or elapsed session time.
