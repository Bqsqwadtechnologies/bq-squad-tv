# Lovable Sync Recovery Audit

**Repository:** `Bqsqwadtechnologies/bq-squad-tv`  
**Audit date:** 2026-11-17  
**Target branch:** `main`

## Executive result

No missing application feature was identified in the GitHub `lovable-sync` branch that should be copied over the current `main` branch. The useful API typing and platform-flag changes are already present on `main`. The current `main` storage registry and its tests are more complete than the versions on `lovable-sync`. The generated route tree must not be manually merged.

**No application source files were changed as part of this audit.** A documentation-only audit record is being added so future work does not repeat the same comparison or accidentally replace newer code.

## Git comparison observed

Comparison: `main` (base) versus `lovable-sync` (head)

- Status: `diverged`
- `lovable-sync` ahead of `main`: 2 commits
- `lovable-sync` behind `main`: 127 commits
- Merge base: `2e9134f51fe0510025aed3a1db3a5aa47a972e69`
- `main` head at audit: `a805db8e6ef7d1833fae8edf1ec46ce696a75171`

**Important interpretation:** the GitHub comparison's “127 behind” means the current `lovable-sync` branch lacks 127 commits that are on `main`. It does not enumerate the separate 127 newer Lovable commits mentioned in the Lovable replacement notification. Those saved Lovable commits are not present as a discoverable GitHub branch in the repository's branch listing (the visible branches were `main` and `lovable-sync`). The Lovable backup's commit objects, messages, and diffs were therefore not available for this GitHub-only audit.

## Files changed in the GitHub sync-branch comparison

| File | Observed change | Decision |
|---|---|---|
| `src/lib/server/api.ts` | Zod schema output typing for `parseBody` | Keep current `main`; the useful generic output typing is already present there. |
| `src/lib/server/flags.ts` | Mutable mapped type for `PlatformFlags` | Keep current `main`; the mutable mapped type is already present there. |
| `src/lib/server/storage/registry.ts` | Older/less complete registry shape on sync branch | Do not copy. Current `main` has additional safeguards and metadata. |
| `src/test/storage-registry.test.ts` | Older/less comprehensive test coverage on sync branch | Do not copy. Current `main` has additional cases. |
| `src/routeTree.gen.ts` | Generated-file change reporting 1,886 additions | Do not manually merge or edit. Regenerate only through the project's normal route-generation/build process when required. |

## Feature-level comparison

### API request parsing

The current `main` implementation uses a generic Zod schema parameter and returns `Promise<z.output<S>>` from `parseBody`. This preserves the schema's parsed output type, including transformed/coerced output. The sync branch contains no additional API feature to recover here.

### Platform flags

The current `main` implementation removes readonly from the mapped `PlatformFlags` properties so normalization can assign validated boolean values. The sync branch contains no additional flag behavior to recover here.

### Storage destination registry

The current `main` registry is the version to preserve. Compared with the sync-branch version, it includes:

- The `producer_verification` storage purpose.
- Account grouping and account-level capacity metadata.
- Destination lifecycle modes: `active`, `drain`, and `retired`.
- Replica relationship metadata.
- Usage values, usage source, and usage-check timestamps.
- Monthly and daily egress accounting and account-level egress tracking.
- Free-egress budget and paid-egress controls.
- Egress alert/level state.
- Destination health state, health-check timestamp, and last error code.
- Eligibility checks that require active mode and known, valid provider usage before automatic routing.

The older sync-branch registry lacks these controls. Replacing the current file with it would be a regression.

### Storage registry tests

The current `main` tests cover account-group defaults, active/draining destination behavior, and safer capacity/usage eligibility in addition to secret redaction and configuration validation. The sync-branch test file is older and would reduce coverage if copied over.

### Generated route tree

The sync comparison reports a large generated `src/routeTree.gen.ts` change. It is not a source-of-truth feature implementation. Do not merge this generated snapshot independently or hand-edit it. Preserve the current `main` version unless a deliberate route change is made and the repository's generator is run.

## Recovery decision

1. Keep the current `main` versions of all five compared files.
2. Do not merge the entire `lovable-sync` branch into `main` just to recover these changes.
3. Do not reset, force-push, squash, or rebase either branch.
4. The two useful API/flags changes are already represented in current `main` history; do not apply duplicate patches.
5. Preserve the `lovable-sync` branch and the Lovable-side backup until the separate 127-commit Lovable backup can be inspected.
6. To audit and selectively recover that separate backup, its actual commit list and diffs (or an exported Git bundle/repository snapshot) must be made available. Without those objects, naming all 127 commits or claiming to have recovered their features would be guesswork.

## Verification limits

- This was a remote Git metadata and file-content comparison.
- No application source changes were needed or made.
- No local dependency installation, test suite, production build, or deployment was run as part of this audit.
- Therefore this audit does not claim that the current repository build or tests passed.
