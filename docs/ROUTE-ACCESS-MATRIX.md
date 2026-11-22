# Route Access & Authorization Matrix

Automatically maintained by `scripts/route-access-matrix.mjs`.

Total scanned routes: **372**

### Summary by Guard Class

| Guard Class | Count |
|---|---|
| `public` | 19 |
| `viewer` | 125 |
| `zillionaire module` | 191 |
| `webhook signature` | 1 |
| `provider` | 14 |
| `playback token` | 2 |
| `worker signature` | 13 |
| `producer` | 7 |

### Inventory

| Route | Guard Class | Specific Guard | File |
|---|---|---|---|
| `/api/public/firebase-schema-inspect` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/firebase-schema-inspect.ts` |
| `/api/public/v1/account/delete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/account/delete.ts` |
| `/api/public/v1/account/export` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/account/export.ts` |
| `/api/public/v1/ads/$adId/events` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/$adId/events.ts` |
| `/api/public/v1/ads/campaigns` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/ads/campaigns.ts` |
| `/api/public/v1/ads/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/ads/next.ts` |
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
| `/api/public/v1/catalog/trending` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/catalog/trending.ts` |
| `/api/public/v1/change-requests/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/change-requests/index.ts` |
| `/api/public/v1/change-requests/$id/rollback` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/change-requests/$id/rollback.ts` |
| `/api/public/v1/channels/$channelId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/channels/$channelId.ts` |
| `/api/public/v1/channels/$channelId/chat` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/channels/$channelId.chat.ts` |
| `/api/public/v1/comment-reports` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/comment-reports.ts` |
| `/api/public/v1/config/client` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/config/client.ts` |
| `/api/public/v1/contact` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/contact.ts` |
| `/api/public/v1/content-assets/$assetId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId.ts` |
| `/api/public/v1/content-assets/$assetId/comments` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId/comments.ts` |
| `/api/public/v1/content-assets/$assetId/rating` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-assets/$assetId/rating.ts` |
| `/api/public/v1/content-assets/$assetId/rights-evidence` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/content-assets/$assetId/rights-evidence.ts` |
| `/api/public/v1/content-reports/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/content-reports/index.ts` |
| `/api/public/v1/continue-watching/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/continue-watching/index.ts` |
| `/api/public/v1/continue-watching/position` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/continue-watching/position.ts` |
| `/api/public/v1/devices/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/index.ts` |
| `/api/public/v1/devices/$deviceId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/$deviceId.ts` |
| `/api/public/v1/devices/push-token` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/devices/push-token.ts` |
| `/api/public/v1/epg/` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/epg/index.ts` |
| `/api/public/v1/epg/remind` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/epg/remind.ts` |
| `/api/public/v1/errors/beacon` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/errors/beacon.ts` |
| `/api/public/v1/errors/report` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/errors/report.ts` |
| `/api/public/v1/kyc/handoff/create` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/kyc/handoff/create.ts` |
| `/api/public/v1/kyc/handoff/resolve` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/kyc/handoff/resolve.ts` |
| `/api/public/v1/kyc/otp` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/kyc/otp.ts` |
| `/api/public/v1/kyc/strings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/kyc/strings.ts` |
| `/api/public/v1/legal/acceptance` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/acceptance.ts` |
| `/api/public/v1/legal/consent` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/legal/consent.ts` |
| `/api/public/v1/legal/required` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/required.ts` |
| `/api/public/v1/legal/status` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/legal/status.ts` |
| `/api/public/v1/monitoring/client-errors` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/monitoring/client-errors.ts` |
| `/api/public/v1/notifications` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications.ts` |
| `/api/public/v1/notifications/$notificationId/read` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/$notificationId/read.ts` |
| `/api/public/v1/notifications/badges` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/badges.ts` |
| `/api/public/v1/notifications/unread-count` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/notifications/unread-count.ts` |
| `/api/public/v1/pages/$slug` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/pages/$slug.ts` |
| `/api/public/v1/partner/enquiry` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/partner/enquiry.ts` |
| `/api/public/v1/payments/paystack/initialize` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/initialize.ts` |
| `/api/public/v1/payments/paystack/verify` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/payments/paystack/verify.ts` |
| `/api/public/v1/payments/paystack/webhook` | `webhook signature` | verifyPaystackSignature (HMAC-SHA512 webhook signature verification) | `src/routes/api/public/v1/payments/paystack/webhook.ts` |
| `/api/public/v1/preview/grant` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/preview/grant.ts` |
| `/api/public/v1/producer/analytics` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/analytics.ts` |
| `/api/public/v1/producer/channels` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels.ts` |
| `/api/public/v1/producer/channels/$channelId/assets` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/assets.ts` |
| `/api/public/v1/producer/channels/$channelId/schedule` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/schedule.ts` |
| `/api/public/v1/producer/channels/$channelId/schedule/$programmeId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/schedule/$programmeId.ts` |
| `/api/public/v1/producer/channels/$channelId/team` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/channels/$channelId/team.ts` |
| `/api/public/v1/producer/collaborations/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/collaborations/index.ts` |
| `/api/public/v1/producer/content-assets/$assetId/appeal` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/content-assets/$assetId/appeal.ts` |
| `/api/public/v1/producer/earnings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/earnings.ts` |
| `/api/public/v1/producer/lifecycle/name-change` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/lifecycle/name-change.ts` |
| `/api/public/v1/producer/mobile-summary` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/mobile-summary.ts` |
| `/api/public/v1/producer/payout-profile` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payout-profile.ts` |
| `/api/public/v1/producer/payout-proof-upload` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payout-proof-upload.ts` |
| `/api/public/v1/producer/payouts` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payouts.ts` |
| `/api/public/v1/producer/payouts/request` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/payouts/request.ts` |
| `/api/public/v1/producer/profile` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/profile.ts` |
| `/api/public/v1/producer/team` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/team.ts` |
| `/api/public/v1/producer/tier2-verification` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/tier2-verification.ts` |
| `/api/public/v1/producer/uploads/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/uploads/index.ts` |
| `/api/public/v1/producer/uploads/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/uploads/complete.ts` |
| `/api/public/v1/producer/uploads/draft` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/uploads/draft.ts` |
| `/api/public/v1/producer/uploads/session` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/uploads/session.ts` |
| `/api/public/v1/producer/verification` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/verification.ts` |
| `/api/public/v1/producer/verification/draft` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/verification/draft.ts` |
| `/api/public/v1/producer/verification/upload-intent` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producer/verification/upload-intent.ts` |
| `/api/public/v1/producers/$slug` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producers/$slug.ts` |
| `/api/public/v1/producers/$slug/comments/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producers/$slug/comments/index.ts` |
| `/api/public/v1/producers/$slug/comments/$commentId/report` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producers/$slug/comments/$commentId/report.ts` |
| `/api/public/v1/producers/$slug/follow` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/producers/$slug/follow.ts` |
| `/api/public/v1/profile/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/complete.ts` |
| `/api/public/v1/profile/country` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/country.ts` |
| `/api/public/v1/profile/preferences` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profile/preferences.ts` |
| `/api/public/v1/profiles/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/profiles/index.ts` |
| `/api/public/v1/provider/channels` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/channels.ts` |
| `/api/public/v1/provider/channels/$id/checklist` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/provider/channels/$id/checklist.ts` |
| `/api/public/v1/provider/contracts` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/contracts.ts` |
| `/api/public/v1/provider/dashboard` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/dashboard.ts` |
| `/api/public/v1/provider/disputes` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/disputes.ts` |
| `/api/public/v1/provider/register` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/register.ts` |
| `/api/public/v1/provider/statements` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/statements.ts` |
| `/api/public/v1/provider/team` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/provider/team.ts` |
| `/api/public/v1/provider/verification` | `provider` | requireProvider (Active provider license and tenant membership) | `src/routes/api/public/v1/provider/verification.ts` |
| `/api/public/v1/provider/verification/draft` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/provider/verification/draft.ts` |
| `/api/public/v1/quality/settings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/quality/settings.ts` |
| `/api/public/v1/reactions` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/reactions.ts` |
| `/api/public/v1/recommendations/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/recommendations/index.ts` |
| `/api/public/v1/search/v2` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/search/v2.ts` |
| `/api/public/v1/security/integrity/challenge` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/security/integrity/challenge.ts` |
| `/api/public/v1/sessions/$sessionId/end` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/end.ts` |
| `/api/public/v1/sessions/$sessionId/heartbeat` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/heartbeat.ts` |
| `/api/public/v1/sessions/$sessionId/recover` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/recover.ts` |
| `/api/public/v1/sessions/$sessionId/refresh` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/refresh.ts` |
| `/api/public/v1/sessions/$sessionId/replica/next` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/$sessionId/replica/next.ts` |
| `/api/public/v1/sessions/start` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/sessions/start.ts` |
| `/api/public/v1/sports/competitions` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/sports/competitions.ts` |
| `/api/public/v1/sports/matches` | `public` | Public Allow-List (Reviewed unauthenticated public endpoint) | `src/routes/api/public/v1/sports/matches.ts` |
| `/api/public/v1/storage/complete` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/complete.ts` |
| `/api/public/v1/storage/intent` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/storage/intent.ts` |
| `/api/public/v1/streaming/hls/$` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/hls/$.ts` |
| `/api/public/v1/streaming/key/$assetId` | `playback token` | verifyPlaybackToken (Session lease / content playback token verification) | `src/routes/api/public/v1/streaming/key/$assetId.ts` |
| `/api/public/v1/support/tickets` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/support/tickets.ts` |
| `/api/public/v1/titles/$titleId/rate` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/titles/$titleId/rate.ts` |
| `/api/public/v1/user/library/liked` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/user/library/liked.ts` |
| `/api/public/v1/user/notification-preferences` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/user/notification-preferences.ts` |
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
| `/api/public/v1/wallet/watch-history` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/wallet/watch-history.ts` |
| `/api/public/v1/watch-parties/` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/watch-parties/index.ts` |
| `/api/public/v1/watch-parties/$partyId` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/watch-parties/$partyId.ts` |
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
| `/api/public/v1/zillionaire/access/lock` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/lock.ts` |
| `/api/public/v1/zillionaire/access/mfa` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/mfa.ts` |
| `/api/public/v1/zillionaire/access/sessions` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/sessions.ts` |
| `/api/public/v1/zillionaire/access/status` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/status.ts` |
| `/api/public/v1/zillionaire/access/step-up` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/step-up.ts` |
| `/api/public/v1/zillionaire/access/unlock` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/access/unlock.ts` |
| `/api/public/v1/zillionaire/ads/campaigns` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/campaigns.ts` |
| `/api/public/v1/zillionaire/ads/campaigns/$campaignId` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/campaigns/$campaignId.ts` |
| `/api/public/v1/zillionaire/ads/creatives` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/creatives.ts` |
| `/api/public/v1/zillionaire/ads/providers` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/providers.ts` |
| `/api/public/v1/zillionaire/ads/reports` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/reports.ts` |
| `/api/public/v1/zillionaire/ads/settings` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/settings.ts` |
| `/api/public/v1/zillionaire/ads/units` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/ads/units.ts` |
| `/api/public/v1/zillionaire/analytics/overview` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/analytics/overview.ts` |
| `/api/public/v1/zillionaire/approvals` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/approvals.ts` |
| `/api/public/v1/zillionaire/audit` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/audit.ts` |
| `/api/public/v1/zillionaire/backups` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/backups.ts` |
| `/api/public/v1/zillionaire/billing/health` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/zillionaire/billing/health.ts` |
| `/api/public/v1/zillionaire/blocked-content/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/blocked-content/index.ts` |
| `/api/public/v1/zillionaire/blocked-content/$assetId/unblock` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/blocked-content/$assetId/unblock.ts` |
| `/api/public/v1/zillionaire/channels` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/channels.ts` |
| `/api/public/v1/zillionaire/channels/` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/index.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/actions` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/actions.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/assets` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/channels/$channelId/assets.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/publish` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/publish.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/schedule` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/schedule.ts` |
| `/api/public/v1/zillionaire/channels/$channelId/schedule/$programmeId` | `zillionaire module` | requireZillionaire (Module: channels) | `src/routes/api/public/v1/zillionaire/channels/$channelId/schedule/$programmeId.ts` |
| `/api/public/v1/zillionaire/cleanup-sample` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/cleanup-sample.ts` |
| `/api/public/v1/zillionaire/comments/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/comments/index.ts` |
| `/api/public/v1/zillionaire/config/flags` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/config/flags.ts` |
| `/api/public/v1/zillionaire/config/modal-spend` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/config/modal-spend.ts` |
| `/api/public/v1/zillionaire/config/pricing` | `zillionaire module` | requireZillionaire (Module: pricing) | `src/routes/api/public/v1/zillionaire/config/pricing.ts` |
| `/api/public/v1/zillionaire/config/settings` | `zillionaire module` | requireZillionaire (Module: settings) | `src/routes/api/public/v1/zillionaire/config/settings.ts` |
| `/api/public/v1/zillionaire/content-assets/` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/index.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/actions` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/actions.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/approve` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/approve.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/cancel` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/cancel.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/feature` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/feature.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/publish` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/publish.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/ready` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/ready.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/reprocess` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/reprocess.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/revoke-tokens` | `zillionaire module` | requireZillionaire (Zillionaire Owner / Scope Check) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/revoke-tokens.ts` |
| `/api/public/v1/zillionaire/content-assets/$assetId/rights` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/content-assets/$assetId/rights.ts` |
| `/api/public/v1/zillionaire/content-comments/$commentId/moderate` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/content-comments/$commentId/moderate.ts` |
| `/api/public/v1/zillionaire/copyright-cases/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/copyright-cases/index.ts` |
| `/api/public/v1/zillionaire/delivery/` | `zillionaire module` | requireZillionaire (Module: delivery) | `src/routes/api/public/v1/zillionaire/delivery/index.ts` |
| `/api/public/v1/zillionaire/email/outbox/` | `zillionaire module` | requireZillionaire (Module: notifications) | `src/routes/api/public/v1/zillionaire/email/outbox/index.ts` |
| `/api/public/v1/zillionaire/email/outbox/$outboxId/resend` | `zillionaire module` | requireZillionaire (Module: notifications) | `src/routes/api/public/v1/zillionaire/email/outbox/$outboxId/resend.ts` |
| `/api/public/v1/zillionaire/email/test` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/email/test.ts` |
| `/api/public/v1/zillionaire/errors/` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/errors/index.ts` |
| `/api/public/v1/zillionaire/finance` | `zillionaire module` | requireZillionaire (Module: finance) | `src/routes/api/public/v1/zillionaire/finance.ts` |
| `/api/public/v1/zillionaire/hero-slots` | `zillionaire module` | requireZillionaire (Module: catalog) | `src/routes/api/public/v1/zillionaire/hero-slots.ts` |
| `/api/public/v1/zillionaire/kyc/bulk-action` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/bulk-action.ts` |
| `/api/public/v1/zillionaire/kyc/country-rules` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/country-rules.ts` |
| `/api/public/v1/zillionaire/kyc/detail` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/detail.ts` |
| `/api/public/v1/zillionaire/kyc/export-case` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/export-case.ts` |
| `/api/public/v1/zillionaire/kyc/lifecycle/account-closure` | `zillionaire module` | requireZillionaire (Module: compliance) | `src/routes/api/public/v1/zillionaire/kyc/lifecycle/account-closure.ts` |
| `/api/public/v1/zillionaire/kyc/lifecycle/erasure-request` | `zillionaire module` | requireZillionaire (Module: compliance) | `src/routes/api/public/v1/zillionaire/kyc/lifecycle/erasure-request.ts` |
| `/api/public/v1/zillionaire/kyc/lifecycle/name-change` | `zillionaire module` | requireZillionaire (Module: compliance) | `src/routes/api/public/v1/zillionaire/kyc/lifecycle/name-change.ts` |
| `/api/public/v1/zillionaire/kyc/lifecycle/scan-expiries` | `zillionaire module` | requireZillionaire (Module: compliance) | `src/routes/api/public/v1/zillionaire/kyc/lifecycle/scan-expiries.ts` |
| `/api/public/v1/zillionaire/kyc/operations` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/operations.ts` |
| `/api/public/v1/zillionaire/kyc/payout-accounts` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/payout-accounts.ts` |
| `/api/public/v1/zillionaire/kyc/queue` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/queue.ts` |
| `/api/public/v1/zillionaire/kyc/retention/legal-hold` | `zillionaire module` | requireZillionaire (Module: compliance) | `src/routes/api/public/v1/zillionaire/kyc/retention/legal-hold.ts` |
| `/api/public/v1/zillionaire/kyc/reveal` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/reveal.ts` |
| `/api/public/v1/zillionaire/kyc/risk-settings` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/risk-settings.ts` |
| `/api/public/v1/zillionaire/kyc/view-doc` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/kyc/view-doc.ts` |
| `/api/public/v1/zillionaire/live-channels/` | `zillionaire module` | requireZillionaire (Module: live_approvals) | `src/routes/api/public/v1/zillionaire/live-channels/index.ts` |
| `/api/public/v1/zillionaire/live-chat/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/live-chat/index.ts` |
| `/api/public/v1/zillionaire/migration/zillionaire` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/zillionaire/migration/zillionaire.ts` |
| `/api/public/v1/zillionaire/moderation/` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/moderation/index.ts` |
| `/api/public/v1/zillionaire/moderation/workload` | `zillionaire module` | requireZillionaire (Module: moderation) | `src/routes/api/public/v1/zillionaire/moderation/workload.ts` |
| `/api/public/v1/zillionaire/movies/curation/` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/movies/curation/index.ts` |
| `/api/public/v1/zillionaire/notifications` | `zillionaire module` | requireZillionaire (Module: notifications) | `src/routes/api/public/v1/zillionaire/notifications.ts` |
| `/api/public/v1/zillionaire/operations/live` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/operations/live.ts` |
| `/api/public/v1/zillionaire/overview` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/overview.ts` |
| `/api/public/v1/zillionaire/pages/` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/index.ts` |
| `/api/public/v1/zillionaire/pages/publish` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/publish.ts` |
| `/api/public/v1/zillionaire/pages/publish-defaults` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/publish-defaults.ts` |
| `/api/public/v1/zillionaire/pages/rollback` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/rollback.ts` |
| `/api/public/v1/zillionaire/pages/seed` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/seed.ts` |
| `/api/public/v1/zillionaire/pages/settings` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/settings.ts` |
| `/api/public/v1/zillionaire/pages/unpublish` | `zillionaire module` | requireZillionaire (Module: system) | `src/routes/api/public/v1/zillionaire/pages/unpublish.ts` |
| `/api/public/v1/zillionaire/payments/` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/zillionaire/payments/index.ts` |
| `/api/public/v1/zillionaire/payments/$paymentId/reverse` | `zillionaire module` | requireZillionaire (Module: payments) | `src/routes/api/public/v1/zillionaire/payments/$paymentId/reverse.ts` |
| `/api/public/v1/zillionaire/payouts/` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/index.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/audit-copy` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/audit-copy.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/review` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/review.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/settle` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/settle.ts` |
| `/api/public/v1/zillionaire/payouts/$payoutId/transfer-details` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/$payoutId/transfer-details.ts` |
| `/api/public/v1/zillionaire/payouts/export` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/export.ts` |
| `/api/public/v1/zillionaire/payouts/rules` | `zillionaire module` | requireZillionaire (Module: payouts) | `src/routes/api/public/v1/zillionaire/payouts/rules.ts` |
| `/api/public/v1/zillionaire/producers/` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/zillionaire/producers/index.ts` |
| `/api/public/v1/zillionaire/producers/$uid/actions` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/zillionaire/producers/$uid/actions.ts` |
| `/api/public/v1/zillionaire/producers/$uid/verification` | `zillionaire module` | requireZillionaire (Module: producers) | `src/routes/api/public/v1/zillionaire/producers/$uid/verification.ts` |
| `/api/public/v1/zillionaire/promotions/` | `zillionaire module` | requireZillionaire (Module: ads) | `src/routes/api/public/v1/zillionaire/promotions/index.ts` |
| `/api/public/v1/zillionaire/providers/` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/index.ts` |
| `/api/public/v1/zillionaire/providers/approved-emails` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/approved-emails.ts` |
| `/api/public/v1/zillionaire/providers/channels` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/channels.ts` |
| `/api/public/v1/zillionaire/providers/test-playback` | `zillionaire module` | requireZillionaire (Module: providers) | `src/routes/api/public/v1/zillionaire/providers/test-playback.ts` |
| `/api/public/v1/zillionaire/rails` | `zillionaire module` | requireZillionaire (Module: catalog) | `src/routes/api/public/v1/zillionaire/rails.ts` |
| `/api/public/v1/zillionaire/receipts/` | `zillionaire module` | requireZillionaire (Module: finance) | `src/routes/api/public/v1/zillionaire/receipts/index.ts` |
| `/api/public/v1/zillionaire/receipts/$receiptId/pdf` | `zillionaire module` | requireZillionaire (Module: finance) | `src/routes/api/public/v1/zillionaire/receipts/$receiptId/pdf.ts` |
| `/api/public/v1/zillionaire/receipts/$receiptId/resend` | `zillionaire module` | requireZillionaire (Module: finance) | `src/routes/api/public/v1/zillionaire/receipts/$receiptId/resend.ts` |
| `/api/public/v1/zillionaire/referrals/` | `zillionaire module` | requireZillionaire (Module: finance) | `src/routes/api/public/v1/zillionaire/referrals/index.ts` |
| `/api/public/v1/zillionaire/reports/monthly` | `zillionaire module` | requireZillionaire (Module: overview) | `src/routes/api/public/v1/zillionaire/reports/monthly.ts` |
| `/api/public/v1/zillionaire/rights-review/` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/rights-review/index.ts` |
| `/api/public/v1/zillionaire/secret-health` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/secret-health.ts` |
| `/api/public/v1/zillionaire/security/abuse-settings` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/abuse-settings.ts` |
| `/api/public/v1/zillionaire/security/events` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/events.ts` |
| `/api/public/v1/zillionaire/security/holds` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/holds.ts` |
| `/api/public/v1/zillionaire/security/incident-mode` | `zillionaire module` | requireZillionaire (Zillionaire Owner / Scope Check) | `src/routes/api/public/v1/zillionaire/security/incident-mode.ts` |
| `/api/public/v1/zillionaire/security/lookup-actor` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/lookup-actor.ts` |
| `/api/public/v1/zillionaire/security/reputation` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/security/reputation.ts` |
| `/api/public/v1/zillionaire/series/` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/series/index.ts` |
| `/api/public/v1/zillionaire/sports/competitions` | `zillionaire module` | requireZillionaire (Module: sports) | `src/routes/api/public/v1/zillionaire/sports/competitions.ts` |
| `/api/public/v1/zillionaire/sports/fixtures` | `zillionaire module` | requireZillionaire (Module: sports) | `src/routes/api/public/v1/zillionaire/sports/fixtures.ts` |
| `/api/public/v1/zillionaire/sports/teams` | `zillionaire module` | requireZillionaire (Module: sports) | `src/routes/api/public/v1/zillionaire/sports/teams.ts` |
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
| `/api/public/v1/zillionaire/strikes/` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/strikes/index.ts` |
| `/api/public/v1/zillionaire/support/` | `zillionaire module` | requireZillionaire (Module: support) | `src/routes/api/public/v1/zillionaire/support/index.ts` |
| `/api/public/v1/zillionaire/support/messages` | `zillionaire module` | requireZillionaire (Module: support) | `src/routes/api/public/v1/zillionaire/support/messages.ts` |
| `/api/public/v1/zillionaire/team` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/zillionaire/team.ts` |
| `/api/public/v1/zillionaire/team/$uid` | `zillionaire module` | requireZillionaire (Module: roles) | `src/routes/api/public/v1/zillionaire/team/$uid.ts` |
| `/api/public/v1/zillionaire/test-lab` | `zillionaire module` | requireZillionaire (Module: video) | `src/routes/api/public/v1/zillionaire/test-lab.ts` |
| `/api/public/v1/zillionaire/trending/config` | `zillionaire module` | requireZillionaire (Module: catalog) | `src/routes/api/public/v1/zillionaire/trending/config.ts` |
| `/api/public/v1/zillionaire/trending/promotions` | `zillionaire module` | requireZillionaire (Module: catalog) | `src/routes/api/public/v1/zillionaire/trending/promotions.ts` |
| `/api/public/v1/zillionaire/upload/` | `zillionaire module` | requireZillionaire (Module: video) | `src/routes/api/public/v1/zillionaire/upload/index.ts` |
| `/api/public/v1/zillionaire/users/` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/zillionaire/users/index.ts` |
| `/api/public/v1/zillionaire/users/$uid/` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/zillionaire/users/$uid/index.ts` |
| `/api/public/v1/zillionaire/users/$uid/permissions` | `viewer` | requireViewer (Authenticated Firebase viewer token + active account session) | `src/routes/api/public/v1/zillionaire/users/$uid/permissions.ts` |
| `/api/public/v1/zillionaire/users/$uid/risk` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/users/$uid/risk.ts` |
| `/api/public/v1/zillionaire/users/$uid/status` | `zillionaire module` | requireZillionaire (Module: users) | `src/routes/api/public/v1/zillionaire/users/$uid/status.ts` |
| `/api/public/v1/zillionaire/video-jobs` | `zillionaire module` | requireZillionaire (Module: content) | `src/routes/api/public/v1/zillionaire/video-jobs.ts` |
| `/api/public/v1/zillionaire/workers` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/workers.ts` |
| `/api/public/v1/zillionaire/workers/$workerId` | `zillionaire module` | requireZillionaire (Module: security) | `src/routes/api/public/v1/zillionaire/workers/$workerId.ts` |
| `/producer/` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.index.tsx` |
| `/producer/channels` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.tsx` |
| `/producer/channels/$channelId/team` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.channels.$channelId.team.tsx` |
| `/producer/collaborations` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.collaborations.tsx` |
| `/producer/docs` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.docs.tsx` |
| `/producer/team` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.team.tsx` |
| `/producer/upload` | `producer` | Producer Verified Shell (Protected producer page shell) | `src/routes/producer.upload.tsx` |
| `/provider/` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.index.tsx` |
| `/provider/channels` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.channels.tsx` |
| `/provider/contracts` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.contracts.tsx` |
| `/provider/disputes` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.disputes.tsx` |
| `/provider/docs` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.docs.tsx` |
| `/provider/statements` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.statements.tsx` |
| `/provider/team` | `provider` | Provider Binding Shell (Protected provider page shell) | `src/routes/provider.team.tsx` |
| `/zillionaire/` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.index.tsx` |
| `/zillionaire/ads` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.ads.tsx` |
| `/zillionaire/analytics` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.analytics.tsx` |
| `/zillionaire/announcements` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.announcements.tsx` |
| `/zillionaire/approvals` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.approvals.tsx` |
| `/zillionaire/audit` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.audit.tsx` |
| `/zillionaire/blocked-content` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.blocked-content.tsx` |
| `/zillionaire/channels` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.channels.tsx` |
| `/zillionaire/cleanup-sample` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.cleanup-sample.tsx` |
| `/zillionaire/collaborations` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.collaborations.tsx` |
| `/zillionaire/comments` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.comments.tsx` |
| `/zillionaire/content-calendar` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.content-calendar.tsx` |
| `/zillionaire/copyright-cases` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.copyright-cases.tsx` |
| `/zillionaire/delivery` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.delivery.tsx` |
| `/zillionaire/errors` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.errors.tsx` |
| `/zillionaire/features` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.features.tsx` |
| `/zillionaire/finance` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.finance.tsx` |
| `/zillionaire/firebase-schema` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.firebase-schema.tsx` |
| `/zillionaire/fraud-watch` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.fraud-watch.tsx` |
| `/zillionaire/geo-rules` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.geo-rules.tsx` |
| `/zillionaire/kyc` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.kyc.tsx` |
| `/zillionaire/live-tv` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.live-tv.tsx` |
| `/zillionaire/moderation` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.moderation.tsx` |
| `/zillionaire/moderation-workload` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.moderation-workload.tsx` |
| `/zillionaire/movies` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.movies.tsx` |
| `/zillionaire/notifications` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.notifications.tsx` |
| `/zillionaire/pages` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.pages.tsx` |
| `/zillionaire/payments` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.payments.tsx` |
| `/zillionaire/payouts` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.payouts.tsx` |
| `/zillionaire/pricing` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.pricing.tsx` |
| `/zillionaire/privacy-requests` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.privacy-requests.tsx` |
| `/zillionaire/producers` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.producers.tsx` |
| `/zillionaire/promotions` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.promotions.tsx` |
| `/zillionaire/providers` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.providers.tsx` |
| `/zillionaire/receipts` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.receipts.tsx` |
| `/zillionaire/referrals` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.referrals.tsx` |
| `/zillionaire/releases` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.releases.tsx` |
| `/zillionaire/reports` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.reports.tsx` |
| `/zillionaire/rights-review` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.rights-review.tsx` |
| `/zillionaire/scheduled-reports` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.scheduled-reports.tsx` |
| `/zillionaire/search-tuning` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.search-tuning.tsx` |
| `/zillionaire/security` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.security.tsx` |
| `/zillionaire/series` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.series.tsx` |
| `/zillionaire/settings` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.settings.tsx` |
| `/zillionaire/splits-audit` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.splits-audit.tsx` |
| `/zillionaire/sports` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.sports.tsx` |
| `/zillionaire/status-page` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.status-page.tsx` |
| `/zillionaire/storage` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.storage.tsx` |
| `/zillionaire/strikes-appeals` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.strikes-appeals.tsx` |
| `/zillionaire/support` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.support.tsx` |
| `/zillionaire/support-macros` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.support-macros.tsx` |
| `/zillionaire/team` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.team.tsx` |
| `/zillionaire/test-lab` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.test-lab.tsx` |
| `/zillionaire/trending-rails` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.trending-rails.tsx` |
| `/zillionaire/upload-studio` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.upload-studio.tsx` |
| `/zillionaire/video-studio` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.video-studio.tsx` |
| `/zillionaire/viewers` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.viewers.tsx` |
| `/zillionaire/wallets` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.wallets.tsx` |
| `/zillionaire/where-is-everything` | `zillionaire module` | Zillionaire Owner / Delegated Module Shell (Protected console page shell) | `src/routes/zillionaire.where-is-everything.tsx` |
