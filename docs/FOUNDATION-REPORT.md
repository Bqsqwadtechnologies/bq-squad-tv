# File 01 — Foundation Batch Report

Date: 2026-11-17
Branch: `main`

## Coded

- **Brand direction correction:** the website now defaults to the white/light surface with blue/cyan accents; Android defaults to its blue/white light theme. Removed the misleading `Gold` color symbol from the Android theme palette and aligned chart accents to blue/cyan. Explicit dark styling remains available. The shared palette decision is recorded in `docs/DECISIONS.md`.

- **Batch 01 — Audit record:** `docs/AUDIT.md` records source-verified findings and explicitly marks tests unavailable.
- **Batch 02 — Scanner and secret-name checker:** expanded `scripts/scan-public-text.mjs`; added `scripts/check-secret-names.mjs`; documented required setting names in `docs/OWNER-ACTIONS.md`; added `docs/PUBLIC-TEXT-SCAN-BASELINE.md`. The baseline records that no hit list was generated because the scanner could not be run in this environment.
- **Batch 03 — Website wording:** changed the data-structure page and owner dashboard cards to plain wording. This is a partial purge; storage, Video Studio, ads and producer pages still require review.
- **Batch 04 — Android wording:** added `ui/ErrorMessages.kt` and replaced raw exception display in the home screen. Other Android screens still require conversion.
- **Batch 05 — Hidden consoles:** partially implemented. Added `noindex, nofollow, noarchive` metadata to the dashboard, Video Studio, data-structure, storage and pricing screens; updated `public/robots.txt` to disallow `/admin`, `/producer` and `/api/`. These crawler directives are not access control. Random secret-path generation/rotation, identical unauthorized 404 handling, lazy console chunks and a complete per-request permission audit remain outstanding; server API handlers must continue enforcing authorization independently.
- **Batch 06 — Android header:** added safe top inset handling and accessible vector search/notification/profile controls in `HomeScreen.kt`; replaced the bottom profile glyph with a vector icon. No emulator or notch screenshot test was run.
- **Batch 07 — Website header:** enabled `viewport-fit=cover`; made the logo responsive; prioritised account and wallet controls; collapsed search/notifications under 381 px. Added `docs/QA-HEADER.md` with manual checks for 320, 360, 390, 430 and 768 px.
- **Batch 08 — Themes:** added semantic light palette tokens to `src/styles.css` and a light Android Material theme. Theme persistence, account sync and first-paint flash prevention are not implemented.
- **Batch 09 — Shared components:** added website primitives in `src/components/shared.tsx` (card, avatar, empty/error state, skeleton, list row, price chip, rating and segmented control). Android counterparts, bottom sheet, confirm dialog, toast and Learn more integration remain outstanding.
- **Batch 10 — Currency:** wallet summary now returns `currencyCode`, `symbol`, `minorUnitDigits` and `formattedBalance`; added Android BigDecimal minor-unit formatter and unit tests for NGN, USD, GBP, GHS, KES, ZAR, JPY and KWD. The formatter has not been integrated into all Android wallet displays.
- **Batch 11 — Producer/download scope:** producer code is intentionally preserved. The latest owner instruction explicitly says not to remove producer code, so no producer screens, repositories, routes, navigation or related functionality are to be deleted as part of File 01. This supersedes the earlier File 00 Batch 11 removal request. Downloads are also left untouched.
- **Batch 12 — Flags and client config:** expanded server defaults and owner update validation for live TV, provider console, HLS encryption, For You and reminders. Owner UI controls and safe-client config exposure for every intended public flag remain incomplete.
- **Batch 13 — Page set:** not coded. The requested set requires a dedicated route inventory and functional account/payment/help integrations; no placeholder-only set was added.
- **Batch 14 — Accessibility:** added `docs/ACCESSIBILITY.md` recording changes and unverified checks. A full accessibility audit has not been performed.
- **Batch 15 — Final verification:** report written. Scanner, build, type-check, lint and unit tests could not be executed here.

## Tests

- Source files were fetched from `main` before edits and current file SHAs were supplied to sequential update operations.
- `bun run scan:public-text` — not run: no local checkout or Bun runtime.
- `bun scripts/check-secret-names.mjs` — not run: no local checkout or Bun runtime.
- `bun run build` — not run: no local checkout or Bun runtime.
- `bun x tsc --noEmit` — not run: no local checkout or Bun runtime.
- `bun run lint` — not run: no local checkout or Bun runtime.
- `bun run test` — not run: no local checkout or Bun runtime.
- Android unit tests — not run: no local checkout, Gradle runtime or Android SDK.
- Browser viewport screenshots and Android small-screen/notch screenshots — not run.

No tests are reported as passed.

## Not finished or blocked

- Hidden console random-path routing, rotation, identical 404 handling and lazy chunk isolation are not implemented. The new robots/noindex directives are only crawler hygiene, not security.
- Public wording scan baseline has no generated hit list; the scanner must be run and its findings addressed.
- Website and Android jargon cleanup is partial.
- Light/dark preference persistence and cross-account sync are not implemented.
- Full shared component set and requested pages are not implemented.
- Producer code is preserved by explicit owner instruction; the earlier removal request is superseded. Download functionality is also preserved in this pass.
- Expanded flag controls are not yet wired into the owner dashboard.
- Currency output is not fully integrated throughout both clients.
- Full accessibility, browser and device verification remains outstanding.

## Owner actions added

- Review caps and alerts on all existing storage accounts.
- Review the video-processing account spend limit.
- Add the Firestore TTL policy for `videoWorkerNonces.expiresAt`.
- Verify the required server-side setting names listed in `docs/OWNER-ACTIONS.md`; add only missing names in the hosting console.
- Complete responsive header checks in `docs/QA-HEADER.md`.

## Current completion status

File 00 standing documentation is present on `main`. File 01 remains **partially implemented and awaiting owner verification**. Batch 05 now includes crawler exclusions and noindex metadata, but its access-path/security work is still incomplete. Batch 13's requested functional page set remains unimplemented, and several other batches are partial or unverified as listed above. Batch 11's original removal instruction is superseded by the latest owner instruction: preserve producer code. The owner has stated they will perform verification; the required automated and device checks have not been run in this environment.

## Next file

File 02 — Video engine hardening on the existing Modal pipeline. Preserve the current worker, queue, storage adapters, reservations, routing, egress controls and HLS format; improve only in place.
