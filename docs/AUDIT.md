# Foundation Audit — V2 File 01

Date: 2026-11-17
Branch: `main`
Latest main commit reviewed before this audit update: `a688247b1d7952d25daa2e67fc4efa587314870d`.
The commit list was queried from GitHub with descending committer date. Source files below were fetched from `main` and their current blob SHAs were checked before edits.

## Findings verified against current source

| Reported issue | Current result | Evidence / correction |
|---|---|---|
| Android home content can overlap the status bar or display cutout | **Corrected in source** | `HomeScreen.kt` applies `WindowInsets.safeDrawing.only(WindowInsetsSides.Top)` to the scrolling content. The header is not sticky and the profile control still uses a generic person icon rather than the member's initial. |
| Android home top actions are text glyphs | **Partially corrected** | Search, notifications and profile use Material vector icons in `HomeScreen.kt`. Quick-access cards still use text symbols. |
| Android bottom Profile tab is a text glyph | **Corrected** | `BqSqwadTvApp.kt` renders the Profile tab with a Material person icon; other tabs still use text symbols. |
| Website viewport lacks `viewport-fit=cover` | **Corrected** | `src/routes/__root.tsx` includes `viewport-fit=cover`. |
| Website header overflows on narrow screens | **Mostly corrected; one JSX defect found** | `src/routes/index.tsx` uses a 120px logo below 400px, keeps profile and wallet visible, and collapses search/notifications below 381px. The Search anchor has duplicate `href` attributes; this audit follow-up removes the duplicate. |
| Website wallet button has a fixed dollar fallback | **Partially corrected** | It requests the signed-in wallet summary and public client config, but still initializes to `$`; country-based currency for signed-out visitors is not verified. |
| Scanner misses public wording | **Partially corrected** | Scanner covers routes, components, Android, and some email/legal/seed files; its Android and JSX extraction remains heuristic and no baseline scan was run in this remote-only environment. |
| Producer Android screen and client exist | **Confirmed; intentionally preserved** | `ProducerScreen.kt`, producer API/repository and navigation are retained under the later explicit owner instruction not to remove producer code. |
| Downloads placeholder exists | **Confirmed; intentionally preserved for now** | The app navigation still includes Downloads. Previous continuation scope retained existing navigation/features rather than deleting them without a fresh dependency review. |
| Console routes are indexable and robots permits everything | **Partially corrected** | `robots.txt` disallows known admin/producer/API paths and admin pages include noindex metadata. This is crawler hygiene only; random secret paths are not access control and have not been implemented. |
| User-visible vendor/technical wording remains | **Confirmed** | The producer team page still says “Firebase user ID”; several owner/producer pages use technical provider terms. Scanner cleanup remains incomplete. |
| Privacy, terms, producer terms and editable page system are missing | **Not fully verified / incomplete** | A complete route and content inventory is still required; do not assume these systems exist. |
| Full shared component set and both-platform theme persistence | **Incomplete** | Website shared components exist in part; Android has theme palettes but no demonstrated account/device persistence or complete shared component set. |
| Full sign-in/account/help/legal/status page suite | **Incomplete** | Search, channel detail and help pages exist; the complete File 01 page suite is not present. |

## Test results

These commands could not be executed because this environment provides remote GitHub repository operations but no checked-out working tree or Android build environment:

- `bun run build` — not run: no local repository checkout/runtime.
- `bun x tsc --noEmit` — not run: no local repository checkout/runtime.
- `bun run lint` — not run: no local repository checkout/runtime.
- `bun run test` — not run: no local repository checkout/runtime.
- Android unit tests — not run: no Android SDK/Gradle runtime or local checkout.
- Browser screenshots at 320/360/390/430/768px — not run: no browser/Playwright runtime.
- Android small-screen and notch screenshot tests — not run: no emulator runtime.

No result is represented as passing. The source audit is not a substitute for compilation or device verification.

## Preserved scope

- Existing producer screens, repositories, API clients, server routes and navigation remain intact per the explicit owner override.
- No branch, fork, PR branch or history rewrite was created.
- No generated route tree was edited.
- Hidden random console paths were not treated as a security feature; server-side authorization remains mandatory.
- Technical implementation details remain in documentation and server code, not public-facing claims.

## Outstanding File 01 work

- Complete public wording cleanup and run the scanner with a recorded baseline.
- Complete console route protection, authorization review and crawler metadata without relying on secret URLs.
- Finish profile avatar initials, sticky/top-safe header verification and responsive header tests.
- Finish both-platform theme persistence and the shared component set.
- Complete currency formatting across signed-in and signed-out surfaces with exact minor-unit arithmetic.
- Preserve producer and download code unless the owner explicitly reauthorizes removal.
- Complete legal/content pages, matching Android screens, accessibility review and automated checks.
