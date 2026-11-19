# Route Access & Authorization Matrix

Automatically maintained by `scripts/route-access-matrix.mjs`.

Total scanned routes: **193**

### Summary by Guard Class

| Guard Class | Count |
|---|---|
| `public` | 13 |
| `viewer` | 74 |
| `webhook signature` | 1 |
| `provider` | 11 |
| `playback token` | 2 |
| `worker signature` | 13 |
| `zillionaire module` | 75 |
| `producer` | 4 |

### Inventory

| Route | Guard Class | Specific Guard | File |
|---|---|---|---|
| `/api/public/firebase-schema-inspect` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/firebase-schema-inspect.ts` |
| `/api/public/v1/account/export` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/account/export.ts` |
| `/api/public/v1/ads/$adId/events` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/$adId/events.ts` |
| `/api/public/v1/ads/campaigns` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/ads/campaigns.ts` |
| `/api/public/v1/ads/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/next.ts` |
| `/api/public/v1/ads/provider-config` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/provider-config.ts` |
| `/api/public/v1/ads/provider-config` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/provider-config.ts` |
| `/api/public/v1/analytics/viewer` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/analytics/viewer.ts` |
| `/api/public/v1/auth/devices/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/devices/index.ts` |
| `/api/public/v1/auth/devices/signout-all` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/devices/signout-all.ts` |
| `/api/public/v1/auth/email/send-code` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/email/send-code.ts` |
| `/api/public/v1/auth/email/verify-code` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/email/verify-code.ts` |
| `/api/public/v1/auth/session/revoke-all` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/session/revoke-all.ts` |
| `/api/public/v1/auth/web/config` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/auth/web/config.ts` |
| `/api/public/v1/auth/web/me` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/auth/web/me.ts` |
| `/api/public/v1/auth/web/session` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/auth/web/session.ts` |
| `/api/public/v1/auth/web/session/logout` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/auth/web/session/logout.ts` |
| `/api/public/v1/auth/web/session/refresh` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/auth/web/session/refresh.ts` |
| `/api/public/v1/catalog/home` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/catalog/home.ts` |
| `/api/public/v1/catalog/search` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/catalog/search.ts` |
| `/api/public/v1/channels/$channelId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/channels/$channelId.ts` |
| `/api/public/v1/config/client` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/config/client.ts` |
| `/api/public/v1/contact` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/contact.ts` |
| `/api/public/v1/content-assets/$assetId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId.ts` |
| `/api/public/v1/content-assets/$assetId/comments` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId/comments.ts` |
| `/api/public/v1/content-assets/$assetId/rating` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId/rating.ts` |
| `/api/public/v1/continue-watching/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/continue-watching/index.ts` |
| `/api/public/v1/continue-watching/position` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/continue-watching/position.ts` |
| `/api/public/v1/devices/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/index.ts` |
| `/api/public/v1/devices/$deviceId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/$deviceId.ts` |
| `/api/public/v1/devices/push-token` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/push-token.ts` |
| `/api/public/v1/epg/` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/epg/index.ts` |
| `/api/public/v1/epg/remind` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/epg/remind.ts` |
| `/api/public/v1/errors/beacon` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/errors/beacon.ts` |
| `/api/public/v1/errors/report` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/errors/report.ts` |
| `/api/public/v1/legal/acceptance` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/acceptance.ts` |
| `/api/public/v1/legal/required` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/required.ts` |
| `/api/public/v1/legal/status` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/status.ts` |
| `/api/public/v1/notifications` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications.ts` |
| `/api/public/v1/notifications/$notificationId/read` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/$notificationId/read.ts` |
| `/api/public/v1/notifications/unread-count` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/unread-count.ts` |
| `/api/public/v1/pages/$slug` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/pages/$slug.ts` |
| `/api/public/v1/payments/paystack/initialize` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/initialize.ts` |
| `/api/public/v1/payments/paystack/verify` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/verify.ts` |
| `/api/public/v1/payments/paystack/webhook` | `webhook signature` | verifyPaystackSignature (HMAC-SHA512 webhook signature verification) | `src/routes/api/public/v1/payments/paystack/webhook.ts` |
| `/api/public/v1/producer/analytics` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/analytics.ts` |
| `/api/public/v1/producer/channels` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels.ts` |
| `/api/public/v1/producer/channels/$channelId/assets` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/assets.ts` |
| `/api/public/v1/producer/channels/$channelId/schedule` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/schedule.ts` |
| `/api/public/v1/producer/channels/$channelId/schedule/$programmeId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/schedule/$programmeId.ts` |
| `/api/public/v1/producer/channels/$channelId/team` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/team.ts` |
| `/api/public/v1/producer/earnings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/earnings.ts` |
| `/api/public/v1/producer/mobile-summary` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/mobile-summary.ts` |
| `/api/public/v1/producer/payouts` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payouts.ts` |
| `/api/public/v1/producer/payouts/request` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payouts/request.ts` |
| `/api/public/v1/producer/verification` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/verification.ts` |
| `/api/public/v1/producer/verification/upload-intent` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/verification/upload-intent.ts` |
| `/api/public/v1/profile/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/complete.ts` |
| `/api/public/v1/profile/country` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/country.ts` |
| `/api/public/v1/profile/preferences` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/preferences.ts` |
| `/api/public/v1/profiles/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profiles/index.ts` |
| `/api/public/v1/provider/channels` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/channels.ts` |
| `/api/public/v1/provider/contracts` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/contracts.ts` |
| `/api/public/v1/provider/dashboard` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/dashboard.ts` |
| `/api/public/v1/provider/disputes` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/disputes.ts` |
| `/api/public/v1/provider/register` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/register.ts` |
| `/api/public/v1/provider/statements` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/statements.ts` |
| `/api/public/v1/quality/settings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/quality/settings.ts` |
| `/api/public/v1/recommendations/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/recommendations/index.ts` |
| `/api/public/v1/search/v2` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/search/v2.ts` |
| `/api/public/v1/security/integrity/challenge` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/security/integrity/challenge.ts` |
| `/api/public/v1/sessions/$sessionId/end` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/end.ts` |
| `/api/public/v1/sessions/$sessionId/heartbeat` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/heartbeat.ts` |
| `/api/public/v1/sessions/$sessionId/recover` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/recover.ts` |
| `/api/public/v1/sessions/$sessionId/refresh` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/refresh.ts` |
| `/api/public/v1/sessions/$sessionId/replica/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/replica/next.ts` |
| `/api/public/v1/sessions/start` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/start.ts` |
| `/api/public/v1/storage/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/complete.ts` |
| `/api/public/v1/storage/intent` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/intent.ts` |
| `/api/public/v1/streaming/hls/$` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/hls/$.ts` |
| `/api/public/v1/streaming/key/$assetId` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/key/$assetId.ts` |
| `/api/public/v1/support/tickets` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/support/tickets.ts` |
| `/api/public/v1/titles/$titleId/rate` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/titles/$titleId/rate.ts` |
| `/api/public/v1/wallet` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet.ts` |
| `/api/public/v1/wallet/google-play/products` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/google-play/products.ts` |
| `/api/public/v1/wallet/google-play/verify` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/google-play/verify.ts` |
| `/api/public/v1/wallet/history` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/history.ts` |
| `/api/public/v1/wallet/ledger` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/ledger.ts` |
| `/api/public/v1/wallet/preferences` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/preferences.ts` |
| `/api/public/v1/wallet/purchases` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/purchases.ts` |
| `/api/public/v1/wallet/receipt/$paymentId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/receipt/$paymentId.ts` |
| `/api/public/v1/wallet/summary` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/summary.ts` |
| `/api/public/v1/wallet/topups` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/topups.ts` |
| `/api/public/v1/watchlist/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/watchlist/index.ts` |
| `/api/public/v1/watchlist/$titleId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/watchlist/$titleId.ts` |
| `/api/public/v1/worker/jobs/$assetId/complete` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/$assetId/complete.ts` |
| `/api/public/v1/worker/jobs/$assetId/fail` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/$assetId/fail.ts` |
| `/api/public/v1/worker/jobs/$assetId/heartbeat` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/$assetId/heartbeat.ts` |
| `/api/public/v1/worker/jobs/$assetId/target` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/$assetId/target.ts` |
| `/api/public/v1/worker/jobs/$assetId/targets` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/$assetId/targets.ts` |
| `/api/public/v1/worker/jobs/claim` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/jobs/claim.ts` |
| `/api/public/v1/worker/maintenance/claim` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/claim.ts` |
| `/api/public/v1/worker/maintenance/complete` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/complete.ts` |
| `/api/public/v1/worker/maintenance/rebuild-pool` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/rebuild-pool.ts` |
| `/api/public/v1/worker/maintenance/release` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/release.ts` |
| `/api/public/v1/worker/maintenance/run` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/run.ts` |
| `/api/public/v1/worker/maintenance/schedule` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/schedule.ts` |
| `/api/public/v1/worker/maintenance/schedule-wallet-holds` | `worker signature` | requireVideoWorker (Ed25519 / HMAC video worker signature check) | `src/routes/api/public/v1/worker/maintenance/schedule-wallet-holds.ts` |
| `/api/public/v1/zillionaire/ads/campaigns` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/campaigns.ts` |
| `/api/public/v1/zillionaire/ads/campaigns/$campaignId` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/campaigns/$campaignId.ts` |
| `/api/public/v1/zillionaire/ads/providers` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/providers.ts` |
| `/api/public/v1/zillionaire/ads/providers` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/providers.ts` |
| `/api/public/v1/zillionaire/analytics/overview` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/analytics/overview.ts` |
| `/api/public/v1/zillionaire/audit` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/audit.ts` |
| `/api/public/v1/zillionaire/billing/health` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/zillionaire/billing/health.ts` |
| `/api/public/v1/zillionaire/channels` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/channels.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/assets` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/channels/$channelId/assets.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/publish` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/publish.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/schedule` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/schedule.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/schedule/$programmeId` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/schedule/$programmeId.ts` |
| `/api/public/v1/zillionaire/config/flags` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/config/flags.ts` |
| `/api/public/v1/zillionaire/config/modal-spend` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/config/modal-spend.ts` |
| `/api/public/v1/zillionaire/config/pricing` | `zillionaire module` | requireZillionaire (Module: pricing) | `src/routes/api/public/v1/zillionaire/config/pricing.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/approve` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/approve.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/cancel` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/cancel.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/feature` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/feature.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/publish` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/publish.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/ready` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/ready.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/reprocess` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/reprocess.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/rights` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/rights.ts` |
| `/api/public/v1/zillionaire/content-comments/$commentId/moderate` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/content-comments/$commentId/moderate.ts` |
| `/api/public/v1/zillionaire/errors/` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/errors/index.ts` |
| `/api/public/v1/zillionaire/migration/zillionaire` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/zillionaire/migration/zillionaire.ts` |
| `/api/public/v1/zillionaire/migration/zillionaire` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/zillionaire/migration/zillionaire.ts` |
| `/api/public/v1/zillionaire/moderation/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/moderation/index.ts` |
| `/api/public/v1/zillionaire/notifications` | `zillionaire module` | requireZillionaire (Module: notifications) | `src/routes/api/public/v1/zillionaire/notifications.ts` |
| `/api/public/v1/zillionaire/operations/live` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/operations/live.ts` |
| `/api/public/v1/zillionaire/overview` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/overview.ts` |
| `/api/public/v1/zillionaire/pages/publish` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/publish.ts` |
| `/api/public/v1/zillionaire/pages/publish-defaults` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/publish-defaults.ts` |
| `/api/public/v1/zillionaire/pages/rollback` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/rollback.ts` |
| `/api/public/v1/zillionaire/pages/seed` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/seed.ts` |
| `/api/public/v1/zillionaire/pages/settings` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/settings.ts` |
| `/api/public/v1/zillionaire/payments/$paymentId/reverse` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/zillionaire/payments/$paymentId/reverse.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/review` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/review.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/settle` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/settle.ts` |
| `/api/public/v1/zillionaire/producers/` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/zillionaire/producers/index.ts` |
| `/api/public/v1/zillionaire/producers/$uid/verification` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/zillionaire/producers/$uid/verification.ts` |
| `/api/public/v1/zillionaire/providers/` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/index.ts` |
| `/api/public/v1/zillionaire/providers/approved-emails` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/approved-emails.ts` |
| `/api/public/v1/zillionaire/providers/channels` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/channels.ts` |
| `/api/public/v1/zillionaire/providers/test-playback` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/test-playback.ts` |
| `/api/public/v1/zillionaire/reports/monthly` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/reports/monthly.ts` |
| `/api/public/v1/zillionaire/secret-health` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/secret-health.ts` |
| `/api/public/v1/zillionaire/security/events` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/events.ts` |
| `/api/public/v1/zillionaire/security/lookup-actor` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/lookup-actor.ts` |
| `/api/public/v1/zillionaire/storage/backups/restore` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/backups/restore.ts` |
| `/api/public/v1/zillionaire/storage/destinations` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/destinations.ts` |
| `/api/public/v1/zillionaire/storage/discover` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/discover.ts` |
| `/api/public/v1/zillionaire/storage/groups/$groupId/budget` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/groups/$groupId/budget.ts` |
| `/api/public/v1/zillionaire/storage/health` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/health.ts` |
| `/api/public/v1/zillionaire/storage/maintenance` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/maintenance.ts` |
| `/api/public/v1/zillionaire/storage/pins` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/pins.ts` |
| `/api/public/v1/zillionaire/storage/register-discovered` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/register-discovered.ts` |
| `/api/public/v1/zillionaire/storage/replicas` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/replicas.ts` |
| `/api/public/v1/zillionaire/storage/seed` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/seed.ts` |
| `/api/public/v1/zillionaire/storage/usage` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/storage/usage.ts` |
| `/api/public/v1/zillionaire/support/messages` | `zillionaire module` | requireZillionaire (Module: support) | `src/routes/api/public/v1/zillionaire/support/messages.ts` |
| `/api/public/v1/zillionaire/users/` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/zillionaire/users/index.ts` |
| `/api/public/v1/zillionaire/users/$uid/permissions` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/users/$uid/permissions.ts` |
| `/api/public/v1/zillionaire/users/$uid/risk` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/users/$uid/risk.ts` |
| `/api/public/v1/zillionaire/users/$uid/status` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/zillionaire/users/$uid/status.ts` |
| `/api/public/v1/zillionaire/video-jobs` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/video-jobs.ts` |
| `/api/public/v1/zillionaire/workers` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/workers.ts` |
| `/api/public/v1/zillionaire/workers/$workerId` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/workers/$workerId.ts` |
| `/producer-terms` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer-terms.tsx` |
| `/producer/` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.index.tsx` |
| `/producer/channels` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.tsx` |
| `/producer/channels/$channelId/team` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.$channelId.team.tsx` |
| `/provider/` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.index.tsx` |
| `/provider/channels` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.channels.tsx` |
| `/provider/contracts` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.contracts.tsx` |
| `/provider/disputes` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.disputes.tsx` |
| `/provider/statements` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.statements.tsx` |
| `/zillionaire/` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.index.tsx` |
| `/zillionaire/ads` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.ads.tsx` |
| `/zillionaire/firebase-schema` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.firebase-schema.tsx` |
| `/zillionaire/pricing` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.pricing.tsx` |
| `/zillionaire/providers` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.providers.tsx` |
| `/zillionaire/reports` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.reports.tsx` |
| `/zillionaire/storage` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.storage.tsx` |
| `/zillionaire/support` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.support.tsx` |
| `/zillionaire/video-studio` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.video-studio.tsx` |
