# BQ SQWAD TV production readiness

This checklist distinguishes committed application code from external configuration and live verification. A feature is not production-ready merely because its route, adapter or workflow exists.

## Storage dashboard and routing

- [x] Owner-only destination registry and metadata editor.
- [x] Owner-triggered private provider health checks.
- [x] Owner-attested manual usage snapshots with audit reasons.
- [x] Legacy Lovable source and streaming metadata seed action.
- [x] Shared provider-account capacity caps; every bucket in one account group must carry the same verified `accountCapBytes`.
- [x] Shared monthly account-group egress ledger; every destination in a group must use the same `freeEgressBudgetBytes` and `paidEgressEnabled` setting.
- [x] Per-bucket daily egress caps remain independent.
- [ ] Provider usage discovery and scheduled reconciliation for B2 and Lovable.
- [ ] Live health check of every configured destination.
- [ ] Verify account groups against provider account ownership; do not assume bucket count creates extra storage or egress quota.
- [ ] Complete owner-facing usage history, capacity forecasts and reconciliation reports.

## Large source uploads

- [x] Server-side upload intent, destination reservation, short-lived signed upload authorization and source verification.
- [ ] Multipart/resumable upload implementation for large files. Current browser upload is a single signed PUT and is not resumable.
- [ ] Resume-after-network-loss and cancellation/abort tests on real mobile and desktop browsers.
- [ ] Validate the full supported file-size range against each provider and hosting request limits.

## Processing and HLS delivery

- [x] Authenticated worker claim, heartbeat, upload-target, completion and failure endpoints.
- [x] Local FFmpeg runner and container image build workflow.
- [x] HLS object-size, playlist, rendition-reference and segment verification before an asset becomes ready.
- [x] One reserved destination for the complete HLS ladder.
- [ ] Select and configure a persistent container host. The GitHub Actions image workflow only builds/publishes an image; it does not run a persistent worker.
- [ ] Configure `BQ_TV_API_BASE_URL` and `STREAMING_HMAC_SECRET` in the selected host's secret manager.
- [ ] Configure Firestore TTL for `videoWorkerNonces.expiresAt`.
- [ ] Calibrate HLS reservations using measured output sizes across representative licensed test assets, durations, codecs and source resolutions. The current 2.5x-source-size plus 10% estimate is a heuristic, not a guarantee.
- [ ] Add a server-authoritative reservation profile derived from validated media duration and the actual rendition ladder before production uploads are enabled.

## Retention, cleanup and backups

- [ ] Implement audited source/temp cleanup only after a job completes and an owner publishes the asset.
- [ ] Enforce the default seven-day source-retention grace period after publication.
- [ ] Preserve pinned sources and legal holds.
- [ ] Provide a reversible cancellation window before physical deletion.
- [ ] Add failed-output and expired-reservation cleanup.
- [ ] Add provider inventory reconciliation, backup retention and tested restore procedures.

## Viewer, producer and payment release

- [x] Website content details include server-authorized playback sessions, metering heartbeats, ratings and moderated comments.
- [x] Producer channel, schedule, team, earnings and payout-request API/UI foundations are present.
- [x] Paystack web and Google Play purchase verification foundations are present.
- [ ] Complete end-to-end payment verification with provider test credentials and idempotency/replay tests.
- [ ] Verify rights, territory, age restrictions, wallet settlement, producer share and payout review with production-like test data.
- [ ] Run website and Android release builds and verify the deployed API/domain configuration.

## Required end-to-end acceptance test

Use only a test asset that BQ SQWAD TV is authorized to host and deliver.

1. Verify every destination's credentials, health, account group, shared capacity cap and shared egress budget.
2. Upload a large source file; interrupt the network and verify resumability once multipart support is implemented.
3. Verify the source object, declared size, media signature and reservation ledger.
4. Confirm a persistent worker claims the queued job and renews its lease.
5. Confirm all HLS renditions and segments are uploaded to one destination and independently verified.
6. Play the HLS asset through the authenticated streaming route; verify range requests, playlist/segment authorization, heartbeat metering and session end settlement.
7. Confirm the asset is not publishable or playable before successful HLS verification.
8. Verify egress accounting is shared across buckets in the same provider account and daily caps remain per bucket.
9. Record logs, timings, output bytes, failures and restore/rollback evidence.

## Current release gate

Production movie uploads must remain disabled until a persistent worker host is running, provider health and usage are verified, HLS reservation sizing is calibrated, large uploads are reliable, and the full upload-to-playback acceptance test passes. The Website/API workflow must also be run manually against the current `main` commit. Android CI has a previously verified successful run, but that does not validate the current website/backend changes.
