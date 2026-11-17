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
| 10 Rebalancing and tiering | Partially integrated | Verified primary moves now queue old-copy cleanup after a seven-day grace period. Cleanup rechecks the new primary, verified replica record and current asset references, deletes in bounded pages, releases the exact prior committed reservation when its ID is known, and rebuilds the pool index. Destination-wide drain orchestration and legacy historical reservation reconciliation remain incomplete. |
| 11 Read failover | Integrated in source; runtime unverified | HLS playback and content poster/thumbnail signing use the shared asset-media storage resolver, which selects a healthy primary or registered replica. Worker and owner-triggered health checks require three consecutive clean checks before a degraded/unreachable location is restored. End-to-end provider failover tests have not run. |
| 12 Cleanup and lifecycle | Partially integrated | Weekly maintenance scheduling now queues bounded non-legacy HLS orphan scans. Unknown asset paths require two observations at least 24 hours apart plus a further 24-hour wait, then are rechecked before deletion. Weekly source retention checks apply the seven-day published-source rule and respect owner keep pins; a step-up-protected owner pin API/UI is added. Audit summaries, >500-asset pagination and runtime verification remain outstanding. |
| 13 Owner storage screens | Partially implemented | The location list now supports search, progressive 40-row rendering and browser content-visibility for large pools. This reduces initial rendering but is not a measured, fully windowed virtual list; remaining explanations and viewport/performance checks are outstanding. |
| 14 Encrypted configuration backups | Partially integrated; owner setup required | The existing maintenance scheduler can queue weekly encrypted exports to an active healthy backup destination when CONFIG_BACKUP_KEY is configured. The worker verifies uploads and retains the newest eight encrypted files. A step-up-protected preview/apply restore route restores existing non-legacy destination metadata, preserves current connection references and marks restored locations unverified. Playback bindings and delivery ledgers are deliberately not overwritten. Scheduler invocation, backup destination setup and non-production restore tests remain unverified. |
| 15 Tests, docs, report | Not verified | Documentation is updated, but Vitest, typecheck, website build, browser checks and current-SHA CI have not been run. The backend CI workflow is manual-dispatch only; no run for the current File 03 commits was visible. |

## Important safeguards

- Existing legacy source and streaming buckets remain referenced by their established IDs and bucket names. No delete, rename or migration was performed.
- No storage credential values were read or written to Git.
- Paid egress is forced off in the destination metadata/API path and legacy segment-level accounting has been retired.
- The existing Modal maintenance queue is reused; no second worker or queue was introduced.
- No production bucket was created, modified or deleted by this source-only work.

## Latest follow-up

- `0c453f87d18f90066cae1152935a49ef7127b4a0` — consolidated duplicate imports in the maintenance worker (the same reservation function and cleanup helpers had been imported more than once). This is a source-level correction only; no compiler or test runner was available to verify it.
- Destination-wide draining remains unimplemented. The source-retention and orphan tasks still need cursor-based coverage beyond the current bounded query sizes. The owner screen still needs true windowed virtualization and complete explanations.

## Verification

- GitHub commits were created directly on `main`; latest File 03 source commit before this report update: `2ca92f7d79ff5ae413a749594c9a4d1e20661d5c`.
- No matching `backend-ci.yml` run for the latest File 03 commits was visible in GitHub Actions. The workflow remains manual-dispatch only, and the available GitHub connection did not expose a workflow-dispatch action.
- Vitest, typecheck, website build, Android build, browser viewport checks and production provider checks: **not run**. No local runtime was available.
- The maintenance listing-count contract was corrected. The replica verification response also uses the provider listing's actual object count; source-reviewed only, not runtime-verified.
- The worker now records each newly bound primary stream reservation ID so later verified old-copy cleanup can release that exact reservation. Older assets without this field retain conservative accounting until separately reconciled.
- The orphan and source-retention scans currently process up to 500 asset records per scheduled task. Larger collections need cursor-based pagination before claiming complete coverage.
- The most recent GitHub Actions runs visible during this session were for older commit SHAs and do not verify the latest File 03 commits.
- No claim is made that all 15 batches are production-complete. Batches 07, 09–15 retain the integration, coverage or verification gaps listed above.

## Owner actions

1. Confirm the real number of destinations, credential bundle coverage and shared account groups using the protected discovery screen.
2. Verify all ten Backblaze account caps and the current free download allowance with the account owner.
3. Run health and usage reconciliation in controlled chunks and review alerts before enabling any destination for uploads or playback.
4. An adult account owner may configure `CONFIG_BACKUP_KEY` only after registering a dedicated backup destination and reviewing the scoped restore behaviour; test with a non-production backup before relying on it.
5. Keep production uploads and automatic destination draining disabled until the remaining drain orchestration, large-pool pagination and test gates above are closed.

## Next file

File 04 must not begin until the remaining File 03 integrations are completed and the full CI/test suite passes. In particular, do not rely on the newly added helper primitives as if the corresponding worker and playback integrations already exist.
