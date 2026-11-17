# BQ SQWAD TV — Storage audit (File 03, Batch 01)

Date: 2026-11-17  
Repository: `Bqsqwadtechnologies/bq-squad-tv`  
Branch: `main`  
Audit method: read-only inspection of the current Git tree and server source. No production Firestore query or hosting-secret inspection was performed.

## Inventory status

| Item | Verified result |
|---|---|
| Registered destination documents | **Not observable from GitHub source.** The live `storageDestinations` collection was not queried. The protected destination-list API can report the live count after owner sign-in. |
| Owner-reported Lovable buckets | Approximately 326; not independently verified from the hosting project. |
| Owner-reported Backblaze accounts | 10 accounts, one bucket each; not independently verified from provider consoles. |
| Legacy buckets | `bq-sqwad-source-media` and `bq-sqwad-streaming-media` are hard-coded legacy fallbacks and must remain readable. Never delete, rename or migrate them. |
| Secret values resolved | **Not inspected.** Source code cannot establish whether hosting secrets exist or whether their values are valid. Never copy values into this report. |
| Current health states | New/seeded metadata defaults to `unknown`; the existing health route performs an owner-triggered check. No scheduled all-destination sweep exists in the inspected baseline. |
| Usage knowledge | Manual snapshots and upload ledger updates exist. Unknown usage is correctly ineligible for automatic capacity routing. No scheduled provider listing reconciliation exists in the inspected baseline. |

## Confirmed source findings

1. `src/lib/server/storage/registry.ts` validates destination metadata, resolves the existing per-prefix secret names, and returns redacted metadata separately from server-only credentials.
2. Lovable credentials currently require `<PREFIX>_URL` and `<PREFIX>_SERVICE_ROLE_KEY`.
3. Backblaze credentials currently require `<PREFIX>_KEY_ID`, `<PREFIX>_APP_KEY`, `<PREFIX>_BUCKET_ID` and `<PREFIX>_ENDPOINT`. Both numbered B2 prefix patterns have tests.
4. `src/lib/server/storage/routing.ts` excludes unknown usage, unhealthy, disabled, draining, full and unconfigured destinations; it enforces account-group capacity and requires known HLS egress headroom.
5. `src/lib/server/storage/reservations.ts` currently queries up to 500 destination documents for each reservation and calculates account usage by scanning the group. This is too expensive for a 300+ bucket pool.
6. `src/routes/api/public/v1/admin/storage/seed.ts` currently accepts at most 18 destinations and writes each destination in its own transaction.
7. `src/lib/server/storage/providers.ts` already contains Backblaze S3-compatible and Lovable adapters with paginated listing. B2 listing is object-based; no provider-level bucket-usage endpoint is used.
8. `src/lib/server/storage/egress.ts` currently reads the destination group and writes a single account ledger during the grant operation. It needs sharded counters and must not add reads to the media-segment path.
9. `src/lib/server/storage/transfers.ts` keeps the two legacy Lovable buckets as fallbacks for assets without destination IDs.
10. File 02 already added a Modal-driven maintenance queue and worker maintenance endpoints. Its current task runner only handles abandoned HLS attempt-folder deletion; storage health and usage sweep task types still need to be added.

## Allowance decisions for File 03

- Backblaze destination soft cap: 9 GB, leaving a safety margin below the stated first 10 GB free-storage allowance.
- Backblaze downloads: use the lower reading of the published 3× stored-data monthly allowance and the older 1 GB/day reading. Apply an additional safety margin; show the source and the check date in the owner screen. Do not treat this as a guarantee against provider charges.
- Lovable destination soft cap: 4.5 GB for a nominal 5 GB bucket.
- Lovable monthly egress: conservative default of 2× the soft cap per shared project/account group, not per bucket. Buckets sharing a project must share one `accountGroup` counter.
- Unknown capacity, usage or egress remains unavailable for new grants. Quota, payment-required and rate-limit responses degrade the destination for 24 hours and trigger an owner alert.
- Paid egress remains disabled everywhere. There must be no user-facing switch to enable it.
- Heavy maintenance is scheduled and chunked through the existing Modal maintenance task flow; do not add a second worker or queue.

## Work deliberately not claimed

This audit does not claim that any secret resolves, any live bucket is healthy, any quota is available, or any destination count has been verified. Those facts require the protected runtime discovery/reconciliation operations and owner-side provider-console review.
