# BQ SQWAD TV — Master Technical Specification

**Version:** 1.0  
**Status:** Approved architecture baseline; implementation is phased and not yet production-ready.  
**Product:** BQ SQWAD TV  
**Company:** Bq Sqwad Technologies  
**Repository:** `Bqsqwadtechnologies/bq-squad-tv`  
**Default branch:** `main`

This document is the canonical product, business, security and technical specification for BQ SQWAD TV. It supersedes conflicting draft assumptions in earlier planning notes. It does not claim that any external provider, secret, production Firestore rule, payment integration or streaming route is already configured.

## 1. Product principles

1. Pay-as-you-go (PAYG): viewers pay for verified billable playback time, not a compulsory monthly subscription.
2. Every movie and match has its own administrator-governed price per minute.
3. Firebase Authentication and Firestore remain the identity and application-data authority.
4. The backend is authoritative for identity roles, permissions, rights, pricing, sessions, balances, ledger entries, revenue allocation and payouts.
5. Launch content includes both BQ SQWAD TV Originals and third-party licensed content.
6. Delivery is hybrid: authorized third-party providers plus BQ-controlled hosting/delivery for assets BQ is contractually permitted to host.
7. No content is published without documented distribution rights and administrator approval.
8. No private source URL, provider credential, signing key or encryption key is exposed to a client.
9. The existing website and native Android app are preserved and extended incrementally.

## 2. Product surfaces

### Viewer application (Android and website)
- Home/discovery, movies, series, live channels, football/matches, BQ Originals and search.
- Content detail pages with rating, territory availability, per-minute price and rights-aware availability.
- PAYG wallet, deposits, ledger, spending controls and viewing receipts.
- Watchlist, viewing history, profile, registered devices and support.
- Playback UI showing the server-authoritative rate, estimated running cost and settled charges.
- Clear notices when content is unavailable, restricted or under maintenance.

### Producer Console
- Individual and organization producer onboarding.
- Identity/business verification and channel ownership.
- Movie upload, metadata, poster, subtitles and permitted source/delivery configuration.
- Documented rights submission and license status tracking.
- Proposed per-minute pricing within admin-defined limits.
- Content review status, analytics, earnings statements and payout history.
- Producers cannot approve their own content or retrieve plaintext source URLs after saving.

### Organization Portal
- Company legal details, registration jurisdiction/number and registration evidence.
- D-U-N-S number when available/applicable; absence alone is not an automatic rejection.
- Authorized representative, beneficial ownership/director evidence where legally or risk-required.
- Organization members with least-privilege roles: Owner, Content Manager, Finance Manager and custom approved scopes.
- Organization isolation: members see only resources granted to their organization and assigned channels.

### Admin Dashboard
- Users, producers, organizations, channels, content, matches, rights, pricing, wallet/payment operations, revenue, payouts, devices, support, moderation, platform settings and audit trails.
- Sensitive actions require backend authorization, reason capture and immutable audit events.
- High-risk URL reveal and rights overrides require reauthentication and narrowly scoped access.

### Rights Holder Portal
- Rights-holder identity and contact verification.
- Direct license confirmation, territory/platform/term confirmation and authorized-producer confirmation.
- Unauthorized-content reports, dispute evidence and takedown requests.
- Rights-holder confirmation is recorded as evidence; admin retains the platform approval decision.

### Support Centre
- Tickets for account, payment, wallet, playback, refund, producer, licensing and copyright issues.
- Ticket assignment, status, conversation history, resolution and audit trail.

## 3. Technology and trust boundaries

- Android: Kotlin, Jetpack Compose and Media3.
- Website: existing TanStack Start + React application.
- Identity: Firebase Authentication.
- Application data: Cloud Firestore in the existing `africa-south1` project.
- Shared API: existing server-side API route architecture and Firebase Admin REST helper.
- Website payments: Paystack, verified server-side.
- Android digital purchases: Google Play Billing, verified server-side. The Play service-account dependency remains outstanding until supplied and linked in Play Console.
- Notifications: Firebase Cloud Messaging.
- Video bytes: dedicated video provider/private object storage/CDN; never Firestore.
- Secret store: Lovable Cloud Secrets, as an owner-managed deployment dependency. No secret values belong in Git.
- No Supabase, second application database, Cloudflare products/runtime/configuration or Wrangler dependencies.
- Do not contact Lovable or submit Lovable prompts as part of repository work. Changes are made in GitHub directly, subject to the existing hosting/deployment workflow.

**Trust boundary:** browser and Android clients are untrusted. Clients submit intent and telemetry; the server validates and decides. Firestore client rules must deny direct writes to wallets, ledger, sessions, payment outcomes, rights verification, role assignments, revenue allocations, payouts, source credentials and private asset records.

## 4. Firestore data model

The following is a logical schema. Before adding or migrating fields, inspect the existing production schema through the authorized schema inspector and use backward-compatible migrations. Do not create duplicate collections or assume the current production schema matches this proposal.

| Collection | Document key | Purpose and important fields |
|---|---|---|
| `users` | Firebase UID | profile, role tags, status, age-policy state, notification preferences |
| `producers` | producer ID / UID | producer type, verification status, KYC references, plan status |
| `organizations` | organization ID | legal name, jurisdiction, registration number, D-U-N-S if applicable, verification status |
| `organization_members` | organization/member | membership role, scoped permissions, status, expiry |
| `channels` | channel ID | owner UID, organization ID, name, status, channel configuration |
| `channels/{id}/members` | UID | channel role, permissions, status, expiry |
| `movies` | movie ID | title, synopsis, owner/channel, metadata, content asset ID, license ID, price, status |
| `matches` | match ID | competition, participants, schedule, content asset, license, price, status |
| `competitions` | competition ID | competition metadata and rights scope |
| `content_assets` | asset ID | delivery mode, provider/storage reference, encrypted source envelope, processing state |
| `licenses` | license ID | rights holder, licensee, content scope, evidence reference, rights, territories, platforms, term, status |
| `license_verifications` | verification ID | independent checks, verifier, evidence, confirmation, outcome and timestamps |
| `rights_holders` | rights-holder ID | verified legal/contact identity and authorized representatives |
| `rights_holder_requests` | request ID | confirmation request, recipient, scope, response and audit references |
| `content_reports` | report ID | copyright/takedown report, reporter, evidence, status and resolution |
| `wallets` | viewer UID | balanceKobo, reservedKobo, currency, daily limits and updatedAt |
| `ledger` | immutable entry ID | user, signed integer amountKobo, type, reference, idempotency key, session/payment, timestamp |
| `payments` | payment ID | provider, provider reference/token hash, amountKobo, state, idempotency and verification |
| `payout_accounts` | producer ID/account ID | verified beneficiary reference and payout-provider token; sensitive fields restricted |
| `payout_batches` | batch ID | monthly period, producer, eligible net amount, status, provider reference, reconciliation |
| `revenue_shares` | rule/version ID | contract-specific allocation percentages, effective dates and audit metadata |
| `sessions` | session ID | viewer, content, device, price snapshot, state, billable seconds, microKobo accrual, settlement |
| `viewing_events` | event ID | session, server sequence, event type, trusted timestamp and idempotency reference |
| `devices` | device ID | user, platform, registration, last seen, revoked state |
| `playback_authorizations` | authorization ID | session, provider, token hash/reference, expiry, revocation state |
| `pricing` / `config/pricing` | versioned rule | currency, per-content price bounds, defaults, effective version |
| `support_tickets` | ticket ID | requester, category, status, assigned agent, conversation references |
| `notifications` | notification ID | recipient, type, delivery status and timestamps |
| `platform_config` | config key | admin-controlled limits and feature flags |
| `admin_audit_logs` | audit ID | actor, action, target, reason, before/after safe metadata, timestamp |
| `idempotency_records` | scoped key | operation scope, result reference and expiry/retention policy |
| `stream_health` | provider/asset window | availability, latency, error rate and cost telemetry |

### Data modeling rules
- Store money in integer kobo (minor units). Do not use floating-point for money.
- Store per-minute prices as integer kobo/minute.
- Store sub-kobo session accrual as integer micro-kobo (one micro-kobo = 1/1,000,000 kobo) or an equivalently exact integer rational representation.
- Snapshot the exact price and revenue-share rule/version when a session begins.
- Keep private license documents and private asset records out of public catalog responses.
- Store document/object references rather than large media or document bytes in Firestore.
- Use stable IDs, explicit status enums, server timestamps and retention policies.
- Avoid storing full bank credentials or unnecessary identity-document payloads in general-purpose user documents.

## 5. Roles and permissions

Platform roles:
- Viewer.
- Individual Producer.
- Organization Owner.
- Organization Content Manager.
- Organization Finance Manager.
- Rights Reviewer.
- Support Agent.
- Admin.
- Super Admin.

Channel roles continue to use the existing channel access helper and permission model. Existing channel permissions must be reviewed before extension; never bypass `channel-access.ts`.

Rules:
- Viewer reads only their own wallet, ledger, devices, profile and sessions.
- Producer manages only channels/content for which they have active ownership or delegated permissions.
- Content Manager may upload/edit assigned content but cannot approve it or access finance unless separately granted.
- Finance Manager may read scoped statements and payout status but cannot alter rights or publish content.
- Rights Reviewer can review assigned rights evidence but cannot approve their own submission.
- Support Agent sees only assigned tickets and minimum required account context.
- Admin modules are scope-checked server-side.
- Super Admin is anchored to the configured, verified owner email and cannot be demoted by ordinary admin actions.
- Organization membership and channel membership are independent scopes; membership in one does not imply membership in another.
- Every sensitive action is checked by the backend. UI hiding is not authorization.

## 6. Producer onboarding and verification

### Individual
Collect legal name, country, contact verification, address where required, identity evidence where required, producer/business name if applicable, authorization/ownership evidence and verified payout details.

### Organization
Collect legal registered name, registration country/jurisdiction, registration number, registration certificate, registered address, official contacts, authorized representative, representative identity, beneficial ownership/director details where legally or risk-required, D-U-N-S when available/applicable, rights evidence and payout beneficiary details.

Producer states: `draft`, `submitted`, `under_review`, `more_information_required`, `verified`, `rejected`, `suspended`.

Producer verification does not itself grant content distribution rights. Each content asset requires its own rights review.

## 7. Content upload and licensing workflow

1. Producer/admin creates a content draft and selects movie, series, live match or replay.
2. Producer provides metadata, artwork, proposed price and delivery mode.
3. Producer submits documented chain-of-title/distribution authorization.
4. Required rights fields are checked: content identity, rights holder, licensee, authorized producer, commercial online streaming, pay-per-minute/paid streaming, territories, platforms, term, exclusivity, sublicensing/authorization and permitted recording/replay.
5. Admin or assigned rights reviewer examines the evidence.
6. Independent rights-holder confirmation is required for premium/high-value content and live sports; risk-based checks may be required for other content.
7. Admin approves, rejects, requests evidence or suspends.
8. Backend checks license status, territory, platform and validity again at playback authorization.
9. Expiry reminders are sent before the end date. Expired, revoked or disputed content is blocked or suspended according to policy.
10. Rights-holder reports enter a documented takedown/dispute workflow. Credible disputes can trigger temporary suspension while investigated.

License states: `draft`, `pending`, `under_review`, `verification_required`, `verified`, `rejected`, `expired`, `suspended`, `revoked`.

A personal streaming subscription, cinema permission, physical-media permission or social-media upload permission is not proof of commercial retransmission rights. Live sports authorization must expressly cover the competition/event, platform, territory, commercial distribution and relevant dates.

## 8. Hybrid video delivery

Every content asset selects one delivery mode:

### External licensed provider
- Provider contract must authorize the specific playback, territory, platform and commercial model.
- Use the provider's supported playback authorization, signed URLs/cookies, DRM and revocation controls.
- Do not ingest, download, proxy, record or repackage a third-party stream unless the agreement expressly permits it.
- Normalize provider operations behind a server-side adapter: authorize, refresh/renew where supported, revoke, health-check and report usage/cost.
- Never expose provider API keys or source credentials to Android/browser clients.

### BQ-hosted asset
For content BQ owns or is contractually authorized to host:
- Secure resumable ingest with size/type checks and malware/content validation appropriate to the media pipeline.
- Private origin/object storage; no public bucket or guessable permanent media URL.
- Transcode to adaptive-bitrate HLS and/or DASH, with 360p/480p/720p/1080p profiles when source and economics permit.
- Preserve source masters under controlled retention rules.
- Generate thumbnails, captions/subtitles and audio metadata.
- Deliver through a CDN with short-lived signed playback authorization.
- Integrate Widevine DRM or other suitable DRM where supported by the target devices/provider.
- Support revocation, monitoring, storage/egress accounting and incident response.

Firestore stores metadata and references only. Video bytes belong in dedicated storage/video delivery infrastructure. Provider selection is an owner decision based on rights, Nigerian/regional availability, DRM, pricing, reliability, support and contract terms.

### Provider abstraction
Implement a server-side provider registry and common contract for `authorizePlayback`, `refreshPlayback` (optional), `revokePlayback`, `health` and `usage/cost`. Android and web clients call only BQ's playback API. Provider-specific URLs/tokens are returned only when needed for playback and must be short-lived and narrowly scoped.

## 9. Source URL encryption and secret management

- Encrypt sensitive source URLs at the server using authenticated encryption such as AES-256-GCM with a fresh random nonce per encryption.
- Store ciphertext, nonce, authentication tag, key version and provider metadata separately from public content metadata.
- Encryption/signing keys and provider credentials live only in Lovable Cloud Secrets. Add a dedicated URL-encryption key secret before enabling source URL submission; do not invent or commit its value.
- Support key versioning, controlled rotation and tested recovery. Do not silently lose access to existing encrypted sources.
- Producers receive a one-time saved confirmation and cannot read the original plaintext URL again from their account.
- Admin reveal is a separate privileged server action requiring reauthentication, scoped permission, a reason and immutable audit record. Avoid showing source URLs in ordinary list/detail APIs.
- Never log plaintext URLs, tokens, request bodies containing credentials, or decrypted provider secrets.
- If a provider supports credential references or server-to-server authorization, prefer those over storing a long-lived raw URL.
- Encryption at rest does not make a URL secret during playback; playback tokens are short-lived and provider/DRM controls are required. No DRM system can guarantee prevention of all screen recording.

## 10. PAYG billing and wallet

### Pricing
- Each movie and match has its own `pricePerMinuteKobo`.
- Currency at launch: NGN.
- Producers may propose/set prices only within admin-configured bounds and only when their channel permission allows it.
- Admin may set, override, pause or version prices.
- Every session snapshots price and currency at start; later price changes affect new sessions only.
- Display price per minute before playback and a running estimate during playback.

### Exact calculation
For rate (R) kobo/minute and verified billable seconds (S):

`accruedMicroKobo = R * S * 1,000,000 / 60`

Use exact integer/rational arithmetic and carry the remainder across heartbeat intervals. Do not round each heartbeat. At settlement, round the total accrued kobo to the nearest whole kobo using one documented half-up rule, then write the integer-kobo debit. The implementation must guard safe integer/overflow bounds; use BigInt where needed and serialize exact integers safely.

### Billable time
- Bill only verified intervals in which playback is actually advancing.
- Paused, buffering, disconnected, app-idle and reconnecting time is not billable.
- Client play/pause signals are untrusted hints. Combine server time, session sequence, playback authorization, player telemetry and provider signals where available; cap heartbeat intervals and reconcile anomalous gaps.
- A missed heartbeat does not authorize unlimited elapsed-time charging. Apply the documented timeout/grace policy and close/reconcile the session safely.
- Duplicate/replayed events must be idempotent.
- The backend ends or blocks playback when wallet funds, spending limits, license validity, device limit or account status no longer permits it.

### Wallet
- Wallet balance and reserved funds are integer kobo.
- Deposit methods: Paystack on website; Google Play Billing for Android digital wallet credits.
- Verify every payment server-side before crediting.
- Verify Paystack webhook signature and provider reference; deduplicate events.
- Verify Google Play purchase token, product, package, state, quantity and refunds/revocations using the dedicated Play service account before crediting.
- Refunds/chargebacks create compensating ledger entries; never erase financial history.
- Use Firestore transactions, idempotency keys and conflict-safe retries for financial mutations.
- Client never writes balance, ledger, payment status, session charge or purchase outcome.

### Session lifecycle
1. Start validates identity, profile/age rules, content approval, rights, territory, device concurrency, price, wallet, spending limits and integrity signal.
2. Server creates session and price/share snapshots.
3. Backend authorizes provider playback with short-lived access.
4. Heartbeat events are sequenced, deduplicated and reconciled using server time.
5. Session ends on user request, timeout, insufficient funds, rights/device/account revocation or provider failure.
6. Settlement creates exactly one debit and corresponding revenue allocation records.
7. Playback authorization is revoked and the session is immutable/closed.

## 11. Revenue sharing and producer payouts

- Revenue share is contract-specific, versioned and snapshotted on each session.
- Allocate only settled eligible net revenue under the producer contract.
- Define net revenue treatment for taxes, provider fees, refunds, chargebacks and promotions in the producer agreement before launch.
- Illustrative splits in older notes are not binding platform defaults; no split is active until an admin-approved contract/rule exists.
- Monthly payout cadence is automatic, subject to verified producer identity, verified payout details, minimum payout threshold, reconciliation, reserve/hold policy and legal/compliance checks.
- Generate monthly producer statements with gross eligible viewing revenue, adjustments, platform share, producer share, holds, payout reference and final status.
- Idempotently create and execute payout batches; failed payouts remain visible and are reconciled before retry.
- Admin can hold or suspend a payout with a recorded reason; cannot silently alter historical settlements.

## 12. Device controls

- Admin configures the maximum simultaneous playback devices per account.
- Enforce limits server-side at session start and continuously during active sessions.
- Maintain device registration, last-seen, session association and revocation state.
- Allow users to view/revoke eligible devices subject to security policy.
- Admin may revoke device/session access with audit reason.
- Do not use invasive fingerprinting; use app-generated device identifiers and platform signals with privacy disclosure.

## 13. API design principles

Keep the existing `/api/public/v1` namespace and existing routes. Add endpoints incrementally after checking route naming and client contracts.

Required domains:
- Identity/profile and producer onboarding.
- Catalog, movies, matches and channels.
- Content assets/upload lifecycle.
- Licenses and rights-holder verification.
- Playback authorization, sessions, heartbeat and end/reconcile.
- Wallet, ledger, Paystack and Google Play verification.
- Devices and push tokens.
- Producer earnings, statements and payout status.
- Admin producer/content/license/pricing/payout/device/audit actions.
- Support tickets and notifications.

All protected requests verify Firebase ID tokens. Every endpoint validates input with Zod (or existing project convention), applies rate limits, uses server-side role/scope checks, returns consistent error codes and avoids leaking private records. Use idempotency keys for payment, settlement, payout and other retryable mutations.

## 14. Audit, privacy and compliance

- Record actor, action, target, reason, timestamp and safe before/after metadata for privileged changes.
- Never include raw license URLs, access tokens, payment credentials or identity document contents in audit metadata.
- Limit access to identity/license evidence by job role.
- Define retention/deletion policy for identity documents, viewing history, payment records and support data with qualified legal advice.
- Provide privacy notice, terms, producer agreement, organization agreement, rights-holder process, copyright/takedown policy, refund policy and payout terms.
- Obtain qualified Nigerian and relevant international media/IP, privacy and payments advice before public launch.
- Apply age ratings and server-side age restrictions consistently; do not return restricted metadata or playback authorizations to ineligible accounts.

## 15. Testing and production gates

Required automated tests:
- Integer money math, fractional carry and final rounding.
- Concurrent wallet mutations, duplicate payment and duplicate heartbeat.
- Insufficient funds, daily/session limits and refunds.
- Price snapshot immutability.
- Session pause/buffer/disconnect/timeout and reconciliation.
- Producer/channel/organization isolation and role escalation denial.
- License expiry, territory/platform restrictions, rights-holder rejection and takedown.
- Encryption/decryption, nonce uniqueness, key-version rotation and plaintext URL non-disclosure.
- Provider token expiry/revocation and provider failure.
- Device concurrency and revocation.
- Monthly payout idempotency, holds, failed payout and reconciliation.
- Android/web contract compatibility.

Use unit tests, Firebase Emulator Suite or mocks, and provider sandboxes. Do not claim production Firestore access, live provider integration, payment settlement or deployment without direct successful verification.

## 16. Delivery phases

1. Repository audit and schema/contract reconciliation.
2. Security baseline, schema migration plan and test fixtures.
3. Producer/organization identity and permission model.
4. Content metadata, upload references and license workflow.
5. Provider abstraction and one licensed provider sandbox integration.
6. Encrypted source management and admin reveal controls.
7. BQ-hosted ingest/transcode/storage/CDN pilot, only after provider and rights decisions.
8. Wallet, exact PAYG metering, payments and reconciliation.
9. Producer revenue statements and monthly payouts.
10. Viewer Android/web experience and admin/producer/rights-holder portals.
11. Security, legal, performance and cost validation.
12. Controlled launch with approved content and operational support.

## 17. Repository constraints

- Work directly on `main`; no branches, forks or PR branches.
- Preserve existing website, Android app ID/package and working features.
- Do not edit generated `src/routeTree.gen.ts`.
- Do not rewrite pushed Git history.
- Do not introduce Cloudflare, Supabase or another database.
- Do not contact Lovable or send prompts to Lovable.
- Never commit secret values, service-account JSON, signing keys or provider credentials.
- Preserve and harden the existing backend CI workflow; do not replace it.
- Make small, buildable, tested commits and report exact files, commit IDs and test results.
