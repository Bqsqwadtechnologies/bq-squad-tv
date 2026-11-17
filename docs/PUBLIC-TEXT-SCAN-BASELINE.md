# Public Wording Scan — Baseline

Date: 2026-11-17
Branch: `main`

## Scanner coverage updated

`scripts/scan-public-text.mjs` now scans:

- Website route and shared component source, including JSX text, common visible attributes, literal JSX expression strings, and literal TanStack `title:` / `content:` metadata values.
- Android Kotlin source (`.kt`), Compose `Text(...)` literals and content descriptions.
- Android XML string resources.
- HTML, JSX/TSX and supported email/legal/seed template files (`.html`, `.mjml`, `.mustache`, `.liquid`, and related text formats).
- The forbidden-word list and narrowly scoped owner-dashboard Zillionaire exception remain in the scanner.

## Actual execution result

**The baseline scan has not been executed. No actual hit list is available yet.**

Attempts to run the repository locally were blocked:
- A local working tree could not be established in this execution environment; only remote GitHub file operations were available.
- This environment has no checked-out repository or Bun runtime.
- The GitHub connection available here supports reading and committing repository files, but does not provide a shell or a workflow-dispatch action.

Therefore these are **not run**, not passing:
- `bun run scan:public-text`
- `bun run check:secret-names`

No hit list has been fabricated from partial source inspection. Run those commands from a full checkout on `main` to generate the actual baseline. Save the scanner's complete stdout/stderr as the baseline artifact, then resolve each finding and rerun.

## Secret-name checker safety

`scripts/check-secret-names.mjs` prints only required secret names that are missing from the owner checklist or execution environment. It never prints secret values. A missing secret in this environment is not evidence that a deployment secret is absent; this runner has no access to the user's deployment secret store.
