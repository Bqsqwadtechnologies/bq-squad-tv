# Route Access & Authorization Matrix

Automatically maintained by `scripts/route-access-matrix.mjs`.

Total scanned routes: **162**

### Summary by Guard Class

| Guard Class | Count |
|---|---|
| `zillionaire module` | 67 |
| `public` | 8 |
| `viewer` | 57 |
| `webhook signature` | 1 |
| `provider` | 10 |
| `playback token` | 2 |
| `worker signature` | 13 |
| `producer` | 4 |

### Inventory

| Route | Guard Class | Specific Guard | File |
|---|---|---|---|
| `/admin/` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.index.tsx` |
| `/admin/ads` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.ads.tsx` |
| `/admin/firebase-schema` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.firebase-schema.tsx` |
| `/admin/pricing` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.pricing.tsx` |
| `/admin/providers` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.providers.tsx` |
| `/admin/reports` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.reports.tsx` |
| `/admin/storage` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.storage.tsx` |
| `/admin/support` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.support.tsx` |
| `/admin/video-studio` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/admin.video-studio.tsx` |
| `/api/public/firebase-schema-inspect` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/firebase-schema-inspect.ts` |
| `/api/public/v1/account/export` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/account/export.ts` |
| `/api/public/v1/admin/ads/campaigns` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/admin/ads/campaigns.ts` |
| `/api/public/v1/admin/ads/campaigns/$campaignId` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/admin/ads/campaigns/$campaignId.ts` |
| `/api/public/v1/admin/ads/providers` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/admin/ads/providers.ts` |
| `/api/public/v1/admin/ads/providers` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/admin/ads/providers.ts` |
| `/api/public/v1/admin/audit` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/audit.ts` |
| `/api/public/v1/admin/channels` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/channels.ts` |
| `/api/public/v1/admin/channels/$channelId/assets` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/channels/$channelId/assets.ts` |
| `/api/public/v1/admin/channels/$channelId/publish` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/admin/channels/$channelId/publish.ts` |
| `/api/public/v1/admin/channels/$channelId/schedule` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/admin/channels/$channelId/schedule.ts` |
| `/api/public/v1/admin/channels/$channelId/schedule/$programmeId` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/admin/channels/$channelId/schedule/$programmeId.ts` |
| `/api/public/v1/admin/config/flags` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/config/flags.ts` |
| `/api/public/v1/admin/config/modal-spend` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/config/modal-spend.ts` |
| `/api/public/v1/admin/config/pricing` | `zillionaire module` | requireZillionaire (Module: pricing) | `src/routes/api/public/v1/admin/config/pricing.ts` |
| `/api/public/v1/admin/content-assets/$assetId/approve` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/approve.ts` |
| `/api/public/v1/admin/content-assets/$assetId/cancel` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/cancel.ts` |
| `/api/public/v1/admin/content-assets/$assetId/feature` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/feature.ts` |
| `/api/public/v1/admin/content-assets/$assetId/publish` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/publish.ts` |
| `/api/public/v1/admin/content-assets/$assetId/ready` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/ready.ts` |
| `/api/public/v1/admin/content-assets/$assetId/reprocess` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/reprocess.ts` |
| `/api/public/v1/admin/content-assets/$assetId/rights` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/content-assets/$assetId/rights.ts` |
| `/api/public/v1/admin/content-comments/$commentId/moderate` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/admin/content-comments/$commentId/moderate.ts` |
| `/api/public/v1/admin/migration/zillionaire` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/admin/migration/zillionaire.ts` |
| `/api/public/v1/admin/moderation/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/admin/moderation/index.ts` |
| `/api/public/v1/admin/notifications` | `zillionaire module` | requireZillionaire (Module: notifications) | `src/routes/api/public/v1/admin/notifications.ts` |
| `/api/public/v1/admin/overview` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/admin/overview.ts` |
| `/api/public/v1/admin/pages/publish` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/pages/publish.ts` |
| `/api/public/v1/admin/pages/seed` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/pages/seed.ts` |
| `/api/public/v1/admin/pages/settings` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/pages/settings.ts` |
| `/api/public/v1/admin/payments/$paymentId/reverse` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/admin/payments/$paymentId/reverse.ts` |
| `/api/public/v1/admin/payouts/$payoutId/review` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/admin/payouts/$payoutId/review.ts` |
| `/api/public/v1/admin/payouts/$payoutId/settle` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/admin/payouts/$payoutId/settle.ts` |
| `/api/public/v1/admin/producers/` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/admin/producers/index.ts` |
| `/api/public/v1/admin/producers/$uid/verification` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/admin/producers/$uid/verification.ts` |
| `/api/public/v1/admin/providers/` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/admin/providers/index.ts` |
| `/api/public/v1/admin/providers/channels` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/admin/providers/channels.ts` |
| `/api/public/v1/admin/providers/test-playback` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/admin/providers/test-playback.ts` |
| `/api/public/v1/admin/reports/monthly` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/admin/reports/monthly.ts` |
| `/api/public/v1/admin/secret-health` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/secret-health.ts` |
| `/api/public/v1/admin/security/events` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/security/events.ts` |
| `/api/public/v1/admin/security/lookup-actor` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/security/lookup-actor.ts` |
| `/api/public/v1/admin/storage/backups/restore` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/backups/restore.ts` |
| `/api/public/v1/admin/storage/destinations` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/destinations.ts` |
| `/api/public/v1/admin/storage/discover` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/discover.ts` |
| `/api/public/v1/admin/storage/groups/$groupId/budget` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/groups/$groupId/budget.ts` |
| `/api/public/v1/admin/storage/health` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/health.ts` |
| `/api/public/v1/admin/storage/maintenance` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/maintenance.ts` |
| `/api/public/v1/admin/storage/pins` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/pins.ts` |
| `/api/public/v1/admin/storage/register-discovered` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/register-discovered.ts` |
| `/api/public/v1/admin/storage/replicas` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/replicas.ts` |
| `/api/public/v1/admin/storage/seed` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/seed.ts` |
| `/api/public/v1/admin/storage/usage` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/admin/storage/usage.ts` |
| `/api/public/v1/admin/support/messages` | `zillionaire module` | requireZillionaire (Module: support) | `src/routes/api/public/v1/admin/support/messages.ts` |
| `/api/public/v1/admin/users/` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/admin/users/index.ts` |
| `/api/public/v1/admin/users/$uid/permissions` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/admin/users/$uid/permissions.ts` |
| `/api/public/v1/admin/users/$uid/risk` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/users/$uid/risk.ts` |
| `/api/public/v1/admin/users/$uid/status` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/admin/users/$uid/status.ts` |
| `/api/public/v1/admin/video-jobs` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/admin/video-jobs.ts` |
| `/api/public/v1/admin/workers` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/workers.ts` |
| `/api/public/v1/admin/workers/$workerId` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/admin/workers/$workerId.ts` |
| `/api/public/v1/ads/$adId/events` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/$adId/events.ts` |
| `/api/public/v1/ads/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/next.ts` |
| `/api/public/v1/ads/provider-config` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/provider-config.ts` |
| `/api/public/v1/ads/provider-config` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/provider-config.ts` |
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
| `/api/public/v1/devices/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/index.ts` |
| `/api/public/v1/devices/$deviceId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/$deviceId.ts` |
| `/api/public/v1/devices/push-token` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/push-token.ts` |
| `/api/public/v1/legal/acceptance` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/acceptance.ts` |
| `/api/public/v1/legal/required` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/required.ts` |
| `/api/public/v1/legal/status` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/status.ts` |
| `/api/public/v1/notifications` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications.ts` |
| `/api/public/v1/notifications/$notificationId/read` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/$notificationId/read.ts` |
| `/api/public/v1/pages/$slug` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/pages/$slug.ts` |
| `/api/public/v1/payments/paystack/initialize` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/initialize.ts` |
| `/api/public/v1/payments/paystack/verify` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/verify.ts` |
| `/api/public/v1/payments/paystack/webhook` | `webhook signature` | verifyPaystackSignature (HMAC-SHA512 webhook signature verification) | `src/routes/api/public/v1/payments/paystack/webhook.ts` |
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
| `/api/public/v1/provider/channels` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/channels.ts` |
| `/api/public/v1/provider/contracts` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/contracts.ts` |
| `/api/public/v1/provider/dashboard` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/dashboard.ts` |
| `/api/public/v1/provider/disputes` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/disputes.ts` |
| `/api/public/v1/provider/statements` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/statements.ts` |
| `/api/public/v1/security/integrity/challenge` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/security/integrity/challenge.ts` |
| `/api/public/v1/sessions/$sessionId/end` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/end.ts` |
| `/api/public/v1/sessions/$sessionId/heartbeat` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/heartbeat.ts` |
| `/api/public/v1/sessions/$sessionId/refresh` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/refresh.ts` |
| `/api/public/v1/sessions/$sessionId/replica/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/replica/next.ts` |
| `/api/public/v1/sessions/start` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/start.ts` |
| `/api/public/v1/storage/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/complete.ts` |
| `/api/public/v1/storage/intent` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/intent.ts` |
| `/api/public/v1/streaming/hls/$` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/hls/$.ts` |
| `/api/public/v1/streaming/key/$assetId` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/key/$assetId.ts` |
| `/api/public/v1/wallet` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet.ts` |
| `/api/public/v1/wallet/google-play/products` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/google-play/products.ts` |
| `/api/public/v1/wallet/google-play/verify` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/google-play/verify.ts` |
| `/api/public/v1/wallet/history` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/history.ts` |
| `/api/public/v1/wallet/ledger` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/ledger.ts` |
| `/api/public/v1/wallet/preferences` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/preferences.ts` |
| `/api/public/v1/wallet/receipt/$paymentId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/receipt/$paymentId.ts` |
| `/api/public/v1/wallet/summary` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/summary.ts` |
| `/api/public/v1/wallet/topups` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/topups.ts` |
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
| `/producer-terms` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer-terms.tsx` |
| `/producer/` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.index.tsx` |
| `/producer/channels` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.tsx` |
| `/producer/channels/$channelId/team` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.$channelId.team.tsx` |
| `/provider/` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.index.tsx` |
| `/provider/channels` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.channels.tsx` |
| `/provider/contracts` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.contracts.tsx` |
| `/provider/disputes` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.disputes.tsx` |
| `/provider/statements` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.statements.tsx` |
