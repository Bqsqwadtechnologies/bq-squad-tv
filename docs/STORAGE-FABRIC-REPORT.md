# BQ SQWAD TV — File 03 storage fabric implementation report

Date: 17 November 2026  
Branch: `main`  
Scope: File 03 batches 01–15  
Execution method: direct GitHub main-branch edits. No local checkout, browser, TypeScript runtime or Vitest runtime was available in this session.

## Batch status

| Batch | Status | Notes |
|---|---|---|
| 01 Audit | Committed | Audit distinguishes source-confirmed facts from owner-reported counts and live facts that cannot be inspected from GitHub. |
| 02 Credential bundles | Implemented in source | Bundle resolution, per-prefix compatibility and redaction tests are present. Secret values were not inspected. |
| 03 Discovery and bulk registration | Implemented in source | Owner/step-up discovery and bulk registration routes are present; live discovery was not run. |
| 04 Health and usage sweeps | Implemented in source | Existing Modal maintenance queue now has provider health and paginated usage reconciliation. No live sweep was run. |
| 05 Compact pool index | Implemented in source | Compact shards, refresh helpers and tests for large pools are present. 400-destination production load was not run. |
| 06 Round-robin reservations | Implemented in source | Routing cursor and transaction-backed reservations are present. No concurrency load test was run. |
| 07 Asset binding | Partially implemented | Stream assets and committed reservations are linked; poster/thumbnail destination metadata is persisted. Complete universal read-helper adoption and transactional migration of every media record still need verification. |
| 08 Egress governor | Implemented in source; unverified | Expected delivery is reserved at playback grant and extended on heartbeats; monthly/daily limits and hard-off paid egress guards are present. Real provider allowance calibration and alert transitions require owner/runtime verification. |
| 09 Hot replicas | Partially implemented | Owner-triggered replica queue, copy ordering, listing verification and replica records exist. Automatic popularity promotion from watch time and end-to-end viewer distribution are not complete. |
| 10 Rebalancing and tiering | Safety primitives only | Crash-safe phase guards and cold-asset ordering helpers/tests added. A full maintenance worker that performs copy → switch → delete, drains destinations and updates reservations/ledger is not integrated. |
| 11 Read failover | Safety primitives only | Replica selection and three-clean-check recovery helpers/tests added. Session/player/poster read paths are not yet wired to use the helper end-to-end. |
| 12 Cleanup and lifecycle | Safety primitives only | Two-observation orphan confirmation, 24-hour temp expiry and source retention guards/tests added. Scheduled deletion tasks, audit counts and owner pin UI are not integrated. |
| 13 Owner storage screens | Partially implemented | Existing screen includes destination management, pool/group information, health/usage and maintenance actions. Full virtualisation and all requested learn-more explanations were not verified. |
| 14 Encrypted configuration backups | Partially implemented | AES-GCM encryption/decryption core and secret-exclusion tests added. Weekly export, backup-destination upload, last-eight retention and owner restore route are not integrated. |
| 15 Tests, docs, report | Committed | Storage audit, registry guidance, owner actions and this report updated. Test suites were not run locally. |

## Important safeguards

- Existing legacy source and streaming buckets remain referenced by their established IDs and bucket names. No delete, rename or migration was performed.
- No storage credential values were read or written to Git.
- Paid egress is forced off in the destination metadata/API path and legacy segment-level accounting has been retired.
- The existing Modal maintenance queue is reused; no second worker or queue was introduced.
- No production bucket was created, modified or deleted by this source-only work.

## Verification

- GitHub commits were created directly on `main`.
- Vitest, typecheck, website build, Android build, browser viewport checks and production provider checks: **not run**. No local runtime was available.
- The most recent GitHub Actions runs visible during this session were for older commit SHAs and do not verify the latest File 03 commits.
- No claim is made that all 15 batches are production-complete. Batches 07, 09–14 have the explicit integration gaps listed above.

## Owner actions

1. Confirm the real number of destinations, credential bundle coverage and shared account groups using the protected discovery screen.
2. Verify all ten Backblaze account caps and the current free download allowance with the account owner.
3. Run health and usage reconciliation in controlled chunks and review alerts before enabling any destination for uploads or playback.
4. Add `CONFIG_BACKUP_KEY` only after the backup export and restore routes are integrated and reviewed.
5. Keep production uploads and automatic rebalancing disabled until the incomplete integration and test gates above are closed.

## Next file

File 04 must not begin until the remaining File 03 integrations are completed and the full CI/test suite passes. In particular, do not rely on the newly added helper primitives as if the corresponding worker and playback integrations already exist.
