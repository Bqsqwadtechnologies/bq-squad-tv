# Console Authorization Review

Date: 2026-11-17
Repository: `Bqsqwadtechnologies/bq-squad-tv`
Reviewed branch: `main`

## Scope and method

Reviewed the complete current Git tree for the `src/routes/api/public/v1/admin/` and `src/routes/api/public/v1/producer/` route families, the channel-team API, the protected schema-inspection endpoint, and the shared role/permission helpers. This is a source review, not a penetration test or proof of deployed behavior.

## Findings

### Admin API routes

All 28 admin route files were inspected. Each handler performs authenticated user verification and then checks the relevant server-side admin module scope, or performs an explicit super-admin check for permission delegation. The reviewed paths are:

- `admin/ads/campaigns.ts`
- `admin/ads/campaigns/$campaignId.ts`
- `admin/ads/providers.ts`
- `admin/audit.ts`
- `admin/channels.ts`
- `admin/channels/$channelId/assets.ts`
- `admin/channels/$channelId/publish.ts`
- `admin/channels/$channelId/schedule.ts`
- `admin/channels/$channelId/schedule/$programmeId.ts`
- `admin/config/flags.ts`
- `admin/config/pricing.ts`
- `admin/content-assets/$assetId/feature.ts`
- `admin/content-assets/$assetId/ready.ts`
- `admin/content-assets/$assetId/rights.ts`
- `admin/content-comments/$commentId/moderate.ts`
- `admin/notifications.ts`
- `admin/overview.ts`
- `admin/payments/$paymentId/reverse.ts`
- `admin/payouts/$payoutId/review.ts`
- `admin/payouts/$payoutId/settle.ts`
- `admin/producers/$uid/verification.ts`
- `admin/reports/monthly.ts`
- `admin/storage/destinations.ts`
- `admin/storage/health.ts`
- `admin/storage/seed.ts`
- `admin/storage/usage.ts`
- `admin/users/$uid/permissions.ts`
- `admin/users/$uid/status.ts`

Owner-only operations additionally check `isSuperAdmin` or resolve the exact protected owner identity. Permission delegation is explicitly owner-only, prevents self-modification, protects the owner account, and records an audit event. Admin module scopes are resolved from current server-side Firestore data; stale client custom claims do not preserve delegated module access.

### Producer API routes

All 11 producer route files were inspected:

- `producer/channels.ts` checks the active producer role for listing and creation.
- Channel asset and schedule routes check the relevant channel permission.
- Channel team GET/PUT/DELETE re-check channel membership and role/permission in the transaction; the client cannot grant permissions beyond the selected role template.
- Earnings, mobile summary and payout reads/requests check the active producer role.
- Producer verification and verification upload-intent are onboarding endpoints: they require an authenticated, email-verified account, rate-limit submissions and bind upload records to the requesting UID. They intentionally do not require an already-approved producer role, because that would prevent applying for producer status.

### Protected schema inspection

`/api/public/firebase-schema-inspect` uses a dedicated bearer-token signature and claims verification path, checks the configured owner email, and uses a read-only service token for inspection. The route originally read only `ADMIN_EMAIL`, unlike the shared role helper. It now prefers `ZILLIONAIRE_EMAIL` and falls back to `ADMIN_EMAIL`. User-facing errors were made generic, and successful schema responses now include `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow, noarchive`.

### Important security conclusions

- A console page URL is not an authorization boundary.
- Robots directives, metadata, unlisted URLs and random slugs are not access controls.
- No random-slug console routing was added. A guessed or hidden path must never be the thing protecting privileged data.
- The actual security boundary is the server-side authentication, role/module checks and channel permission checks on every protected API request.
- The provider-console flag is not itself an authorization mechanism. No separate provider API route family was present in the inspected tree; a future provider API must have its own explicit server-side provider identity and permission checks.
- The public client-configuration endpoint is intentionally unauthenticated and must continue returning only the filtered public flag/configuration DTO, never privileged settings.

## Follow-up fixes committed

- Schema-inspection owner identity now uses the same `ZILLIONAIRE_EMAIL`-first precedence as the shared role helper.
- Schema-inspection error messages no longer expose vendor/product names to the UI.
- Successful schema-inspection responses are marked non-cacheable and non-indexable.

## Remaining risks and limits

1. This source review does not prove the deployed server is running this exact commit.
2. No live unauthorized-request tests or security penetration tests were run in this environment.
3. The producer verification and platform-channel asset workflows still reference an external storage integration in their implementation. That is a separate architecture/storage migration issue and must not be mistaken for a console authorization bypass.
4. The static `/admin` and `/producer` route shells may still be reachable as pages; they must not expose privileged data without their protected API calls. UI-level hiding is supplementary only.
5. Every new API route must be added to this review checklist and must fail closed when identity, role, scope or channel membership is missing.

## Test status

- Source inspection: completed for the 28 admin route files, 11 producer route files, channel-team route, schema-inspection route and shared role helper.
- Automated authorization tests: not run; no local Bun runtime or checkout is available in this environment.
- Live API tests: not run; no deployed endpoint was called.
