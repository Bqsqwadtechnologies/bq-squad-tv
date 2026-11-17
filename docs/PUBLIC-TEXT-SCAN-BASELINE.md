# Public Wording Scan — Baseline

Date: 2026-11-17

The expanded scanner is committed at `scripts/scan-public-text.mjs`. The companion name-only settings checker is `scripts/check-secret-names.mjs`.

## Execution status

- `bun run scan:public-text` — not run: this execution environment has remote GitHub file access but no checked-out working tree or Bun runtime.
- `bun scripts/check-secret-names.mjs` — not run for the same reason.
- Baseline hit list — not generated. No hits are invented or inferred from partial source excerpts.

Run both commands from the repository root in a local Bun environment to produce the actual baseline. Fix every public wording hit in the website and Android batches; do not suppress a finding merely because it appears in source code. The owner-only Zillionaire exception is deliberately restricted to the owner dashboard route code paths.
