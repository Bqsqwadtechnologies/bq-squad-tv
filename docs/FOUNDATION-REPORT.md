# File 01 — Foundation Batch Report

Date: 2026-11-17
Branch: `main`

## Coded

- **Brand direction correction:** the website now defaults to the white/light surface with blue/cyan accents; Android defaults to its blue/white light theme. Removed the misleading `Gold` color symbol from the Android theme palette and aligned chart accents to blue/cyan. Explicit dark styling remains available. The shared palette decision is recorded in `docs/DECISIONS.md`.

- **Batch 01 — Audit record:** `docs/AUDIT.md` records source-verified findings and explicitly marks tests unavailable.
- **Batch 02 — Scanner and secret-name checker:** expanded `scripts/scan-public-text.mjs`; added `scripts/check-secret-names.mjs`; documented required setting names in `docs/OWNER-ACTIONS.md`; added `docs/PUBLIC-TEXT-SCAN-BASELINE.md`. Follow-up: expanded Android extraction to include named-argument Compose `Text(text = ...)` and semantics content descriptions. The baseline records that no hit list was generated because the scanner could not be run in this environment.
- **Batch 03 — Website wording:** changed the data-structure page and owner dashboard cards to plain wording. This is a partial purge; storage, Video Studio, ads and producer pages still require review.
- **Batch 04 — Android wording:** added `ui/ErrorMessages.kt` and replaced raw exception display in the home screen. Other Android screens still require conversion.
- **Batch 05 — Hidden consoles:** partially implemented. Added `noindex, nofollow, noarchive` metadata to the dashboard, Video Studio, data-structure, storage and pricing screens; updated `public/robots.txt` to disallow `/admin`, `/producer` and `/api/`. These crawler directives are not access control. Random secret-path generation/rotation was deliberately not added: obscurity is not a substitute for the existing authenticated, server-authorized dashboard and could create brittle navigation. Identical unauthorized 404 handling and a complete per-request permission audit remain outstanding; server API handlers must continue enforcing authorization independently. Route-level chunk splitting remains subject to build output verification.
- **Batch 06 — Android header:** added safe top inset handling and accessible vector search/notification/profile controls in `HomeScreen.kt`; replaced the bottom profile glyph with a vector icon. No emulator or notch screenshot test was run.
- **Batch 07 — Website header:** enabled `viewport-fit=cover`; made the logo responsive; prioritised account and wallet controls; collapsed search/notifications under 381 px. Added `docs/QA-HEADER.md` with manual checks for 320, 360, 390, 430 and 768 px.
- **Batch 08 — Themes:** added semantic light palette tokens to `src/styles.css` and a light Android Material theme. Theme persistence, account sync and first-paint flash prevention are not implemented.
- **Batch 09 — Shared components:** added website primitives in `src/components/shared.tsx` (card, avatar, empty/error state, skeleton, list row, price chip, rating and segmented control). Android counterparts, bottom sheet, confirm dialog, toast and Learn more integration remain outstanding.
- **Batch 10 — Currency:** wallet summary now returns `currencyCode`, `symbol`, `minorUnitDigits` and `formattedBalance`; added Android BigDecimal minor-unit formatter and unit tests for NGN, USD, GBP, GHS, KES, ZAR, JPY and KWD. Follow-up: web wallet formatting now reconstructs currency display from integer minor units rather than dividing through floating-point arithmetic. Android formatter integration throughout all wallet displays remains outstanding.
- **Batch 11 — Producer/download scope:** producer code is intentionally preserved. The latest owner instruction explicitly says not to remove producer code, so no producer screens, repositories, routes, navigation or related functionality are to be deleted as part of File 01. This supersedes the earlier File 00 Batch 11 removal request. Downloads are also left untouched.
- **Batch 12 — Flags and client config:** expanded server defaults and owner update validation for live TV, provider console, HLS encryption, For You and reminders. Follow-up: added owner-only feature controls to the Zillionaire dashboard. Saves use the existing protected endpoint, require a reason, retain server-side owner authorization and write the existing audit record. Sensitive provider-console and encryption flags remain omitted from the public flag response. Android/client exposure and end-to-end verification remain outstanding.
- **Batch 13 — Page set:** added functional authenticated channel search (`/search`) backed by the existing adult-filtered catalogue endpoint, channel detail and programme schedule (`/channels/$channelId`) backed by the existing protected channel endpoint, and a help centre (`/help`) with account/wallet guidance and the public support address. Homepage search controls and footer links now lead to these pages. Existing account and wallet routes are retained. Further owner/producer operational modules remain incomplete; no placeholder-only modules were invented.
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

- Hidden console identical unauthorized 404 handling and a complete per-request permission audit remain outstanding. Robots/noindex directives are only crawler hygiene, not security; random secret URLs were intentionally rejected as a security substitute.
- Public wording scan baseline has no generated hit list; the scanner must be run and its findings addressed.
- Website and Android jargon cleanup is partial.
- Light/dark preference persistence and cross-account sync are not implemented.
- Full shared component set and the complete owner/producer operational page set are not implemented. Search, channel details and help are now present.
- Producer code is preserved by explicit owner instruction; the earlier removal request is superseded. Download functionality is also preserved in this pass.
- Expanded flag controls are wired into the owner dashboard, but owner login/save flow and audit records still require owner verification.
- Currency output is not fully integrated throughout both clients.
- Full accessibility, browser and device verification remains outstanding.

## Owner actions added

- Review caps and alerts on all existing storage accounts.
- Review the video-processing account spend limit.
- Add the Firestore TTL policy for `videoWorkerNonces.expiresAt`.
- Verify the required server-side setting names listed in `docs/OWNER-ACTIONS.md`; add only missing names in the hosting console.
- Complete responsive header checks in `docs/QA-HEADER.md`.

## Current completion status

File 00 standing documentation is present on `main`. File 01 remains **partially implemented and awaiting owner verification**. Follow-up commits added owner feature controls, exact integer-minor-unit wallet formatting, authenticated channel search and details, a help centre, homepage links, and better Android text scanning. Hidden-console authorization audit, complete owner/producer modules, Android shared components/theme persistence/currency integration, and several other items remain partial or unverified as listed above. Batch 11's original removal instruction is superseded by the latest owner instruction: preserve producer code. The required automated and device checks have not been run in this environment.

## Next file

File 02 — Video engine hardening on the existing Modal pipeline. Preserve the current worker, queue, storage adapters, reservations, routing, egress controls and HLS format; improve only in place.


## Follow-up verification and corrections (2026-11-17)

The following additional direct-to-main commits were made after the initial report:

- `706d36086cabe83a303d3e07b060028d8b2269c1` — refreshed the audit against the current source and corrected the status of already-completed and still-incomplete items.
- `f96c320d129211f0b476b34f59b3e0efc2e470f0` — Android home profile action now displays the signed-in member's initial (or P) in a 48 dp ringed button; header row minimum height is 56 dp. Existing safe-drawing inset remains in place.
- `7909b40201927f41c516223168d63772d30f3a81` — removed a duplicate `href` attribute from the website Search action.
- `0beca54c6e8f05c26f67d15193ee56a467ba9d61` — wallet summary formats minor units using integer/BigInt arithmetic instead of floating-point division.
- `cb86f6c734850c440b7b1e0adf81a4c020018cee` — replaced “Firebase user ID” with “member ID” on the producer team page and added crawler exclusion metadata.
- `7923234e0144596bc360adab17bc54e782094f17` — added crawler exclusion metadata to the admin advertising settings page.
- `1b01b5145314b91c60943f6de427be9b0cacb80e` — changed the producer workspace title to a generic title and added crawler exclusion metadata.
- `e94244969ba4c9be36904c9421616680dbcbd83e` — updated the accessibility review with the profile avatar and header changes.

These are source edits only. No scanner, build, type-check, lint, unit test, browser screenshot or Android emulator test was run. The hidden-console random-slug requirement remains deliberately unimplemented as a security mechanism; noindex and robots rules do not protect data. Producer and Downloads functionality remain preserved. File 01 is still partial, not complete.


## Four-batch continuation — Batch 3 progress (2026-11-17)

### Committed implementation

- Added authenticated `GET/PUT /api/public/v1/profile/preferences` for the account appearance setting.
- Android stores its selected appearance locally before the first Compose frame, supports System/Light/Dark in Settings, and attempts to synchronize the choice to the signed-in account.
- Website applies the saved device palette from an early head script, exposes a White/Dark navy appearance selector on the account page, and synchronizes it through the same authenticated preferences route when signed in.
- Android wallet display now uses the shared exact minor-unit `CurrencyFormatter`; tests were added for negative subunits and large amounts.
- Website home wallet control no longer displays a fixed dollar symbol while country currency is loading; it shows a wallet icon until the public country/currency configuration arrives, then uses USD only as the fallback.
- Added reusable Compose components for top bar, avatar, icon button, card, list row, empty/error states, skeleton, price chip, rating, segmented control, bottom sheet, confirmation dialog, toast host and a content-driven Learn More sheet.
- Added website shared top bar, icon button, bottom sheet, confirmation dialog, toast helper and Learn More sheet primitives; existing card/avatar/list/error/skeleton/price/rating/segmented components remain available.

### Batch 3 limitations

- The new shared components are foundations and have not yet been migrated into every screen.
- The Learn More sheet accepts supplied content; it is not yet connected to the future editable pages system.
- Theme choice is persisted locally and synchronized to the account, but first paint uses the device preference. A different account preference is reconciled after sign-in/session restoration; no server-rendered Firebase session cookie exists to guarantee account theme before the first unauthenticated HTML paint.
- Some older website screens still use fixed light/dark utility colors rather than semantic tokens, so full visual theme coverage and WCAG contrast verification remain outstanding.
- Country-based currency detection uses trusted request country headers when available and the browser language region as fallback; if neither is present, the configured fallback is USD.
- No Android build, website build, type-check, lint, unit test, emulator or screenshot test was run. No compile or test success is claimed.

Batch 3 is partially implemented; it is not a verified completion.
