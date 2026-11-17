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
| 10 Rebalancing and tiering | Partially integrated; deletion disabled | The existing maintenance worker now accepts owner-queued rebalance tasks, verifies a complete copy, commits its reservation and switches the asset binding transactionally. The old copy is retained; automated deletion, destination drain orchestration and full reservation/ledger reconciliation remain incomplete. |
| 11 Read failover | Partially integrated | HLS storage configuration now checks the primary and its registered replicas and selects a configured healthy location, with legacy unknown-health fallback limited to the established legacy ID. Poster/thumbnail read paths and automated health recovery transitions remain incomplete. |
| 12 Cleanup and lifecycle | Partially integrated | The existing attempt-prefix cleanup worker now enforces a 24-hour minimum age. Two-observation orphan confirmation and source-retention guards remain helper-only; scheduled orphan scans, audit counts and owner pin UI are not integrated. |
| 13 Owner storage screens | Partially implemented | Existing screen includes destination management, pool/group information, health/usage and maintenance actions. Full virtualisation and all requested learn-more explanations were not verified. |
| 14 Encrypted configuration backups | Safety core only | AES-GCM encryption/decryption now rejects credential-like fields recursively before encryption and after decryption, with bounded payload size. Weekly export, backup-destination upload, last-eight retention and owner restore route are not integrated. |
| 15 Tests, docs, report | Committed | Storage audit, registry guidance, owner actions and this report updated. Test suites were not run locally. |

## Important safeguards

- Existing legacy source and streaming buckets remain referenced by their established IDs and bucket names. No delete, rename or migration was performed.
- No storage credential values were read or written to Git.
- Paid egress is forced off in the destination metadata/API path and legacy segment-level accounting has been retired.
- The existing Modal maintenance queue is reused; no second worker or queue was introduced.
- No production bucket was created, modified or deleted by this source-only work.

## Verification

- GitHub commits were created directly on `main`; latest File 03 commit at report time: `c66430424deb5e7dfc7c1b5505888894327cfc0f`.
- New File 03 commits did not have a matching `backend-ci.yml` run visible in GitHub Actions at verification time. The most recent successful backend CI runs were still on older SHAs.
- Vitest, typecheck, website build, Android build, browser viewport checks and production provider checks: **not run**. No local runtime was available.
- The usage-page worker count contract was corrected in `maintenance.ts` and `worker/maintenance/run.ts`; this is source-reviewed only, not runtime-verified.
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
