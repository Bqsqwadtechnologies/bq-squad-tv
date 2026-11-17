# Foundation Audit

Date: 2026-11-17
Branch: `main`
Latest confirmed main commit before this audit: `bda86e9845c43326d3d0f8e39c1aee60d6cde08d` (the File 00 owner-actions commit).
Repository files were fetched from the default branch during this audit. The commit hash above is the last commit directly confirmed by the preceding File 00 work; a fresh remote branch-head API was not available in this execution environment.

## Findings checked against source

| Reported issue | Audit result | Evidence |
|---|---|---|
| Android home header has no explicit safe drawing inset and uses glyphs for search, notifications and profile | Confirmed in the fetched source | `android/app/src/main/java/com/bqsqwad/tv/ui/screens/HomeScreen.kt` |
| Android enables edge-to-edge | Confirmed | `android/app/src/main/java/com/bqsqwad/tv/MainActivity.kt` |
| Website viewport lacks `viewport-fit=cover` | Confirmed | `src/routes/__root.tsx` |
| Website header uses a 168px/205px logo and four fixed 40px actions | Confirmed in the fetched source | `src/routes/index.tsx` |
| Website wallet action uses a dollar fallback | Confirmed; it reads public config and wallet currency symbol but defaults to `$` | `src/routes/index.tsx` |
| Public text scanner has a short and incomplete forbidden list and skips most Android source strings | Confirmed | `scripts/scan-public-text.mjs` |
| Android producer screen exists | Confirmed | `android/app/src/main/java/com/bqsqwad/tv/ui/screens/ProducerScreen.kt` |
| Console routes are indexable and robots permits all paths | Partially confirmed; robots permits all paths. Route-specific title, role checks and sitemap exposure require a full route inventory | `public/robots.txt` |
| User-visible vendor/technical wording exists in website and Android | Not fully audited in this batch; batch 02 scanner and batches 03–04 will enumerate and fix actual hits | Source search is incomplete |
| No privacy, terms, producer terms or editable page system | Not established by the limited file audit; verify in the later pages batch before creating duplicates | Full route/content inventory required |

## Test results

These commands could not be executed because this environment provides remote repository file operations but no checked-out working tree or Android build environment:

- `bun run build` — not run: no local repository checkout/runtime.
- `bun x tsc --noEmit` — not run: no local repository checkout/runtime.
- `bun run lint` — not run: no local repository checkout/runtime.
- `bun run test` — not run: no local repository checkout/runtime.
- Android unit tests — not run: no Android SDK/Gradle runtime or local checkout.

No result is represented as passing.

## Existing standing documents

- `docs/DECISIONS.md` — maintained from File 00.
- `docs/OWNER-ACTIONS.md` — maintained from File 00.
