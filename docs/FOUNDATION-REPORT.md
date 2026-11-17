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
- **Batch 08 — Themes:** added semantic light palette tokens to `src/styles.css` and a light Android Material theme. Device theme persistence and account synchronization were added in the later continuation. Android waits for the account preference before showing the signed-in app; the website applies its local theme before paint and reconciles the account preference after session restoration.
- **Batch 09 — Shared components:** added website primitives in `src/components/shared.tsx` (card, avatar, empty/error state, skeleton, list row, price chip, rating and segmented control). Android counterparts, bottom sheet, confirm dialog, toast and Learn more integration remain outstanding.
- **Batch 10 — Currency:** wallet summary now returns `currencyCode`, `symbol`, `minorUnitDigits` and `formattedBalance`; added Android BigDecimal minor-unit formatter and unit tests for NGN, USD, GBP, GHS, KES, ZAR, JPY and KWD. Follow-up: web wallet formatting now reconstructs currency display from integer minor units rather than dividing through floating-point arithmetic. Android formatter integration throughout all wallet displays remains outstanding.
- **Batch 11 — Producer/download scope:** producer code is intentionally preserved. The latest owner instruction explicitly says not to remove producer code, so no producer screens, repositories, routes, navigation or related functionality are to be deleted as part of File 01. This supersedes the earlier File 00 Batch 11 removal request. The Android Downloads placeholder and navigation destination were removed to preserve the online-only viewing model; no offline download capability is shipped.
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
- Producer code is preserved by explicit owner instruction; the earlier removal request is superseded. Offline downloads are not part of the online-only product model; the Android placeholder destination has been removed.
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

These are source edits only. No scanner, build, type-check, lint, unit test, browser screenshot or Android emulator test was run. The hidden-console random-slug requirement remains deliberately unimplemented as a security mechanism; noindex and robots rules do not protect data. Producer functionality remains preserved. Offline downloads are not implemented. File 01 is still partial, not complete.


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


## Four-batch continuation — Batch 4 progress (2026-11-17)

### Committed implementation

- Added a server-side contact endpoint with input validation, per-email rate limiting and support-mail delivery through the existing email service to `tv@bqsqwad.com`. The contact page now submits directly to this endpoint.
- Added About, Contact, Privacy, Terms and Producer Terms website routes.
- Added maintenance, offline, high-demand, country-unavailable and age-restriction website status routes; the root route already supplies the 404 view.
- Added Android Compose status screens for maintenance, offline, high demand, country unavailability and age restriction.
- Added date of birth to website account registration and connected it to the existing profile-completion endpoint. Added Terms and Privacy links to the sign-up view.
- Added homepage and Android Settings links to the new About/Contact/legal routes.
- Added global keyboard focus-visible outlines and reduced-motion CSS rules.
- Added a fixed Android home header outside the scrolling content, preserving top safe-drawing/cutout padding and 48 dp action targets.

### Batch 4 limitations

- Privacy, Terms and Producer Terms are deliberately publication-pending notices with noindex metadata. They are page shells, not approved legal policies. The company must supply/review the actual policy text before public publication.
- The new status pages are not yet wired to every maintenance, rate-limit, territory, age or offline decision path. The route screens exist; integration into all relevant app/API flows remains.
- The contact endpoint uses the existing email delivery configuration. Delivery was not live-tested from this environment.
- The 404 view exists in the root route; a separate `/404` route was not added.
- Android status screens are reusable composables but have not yet been added to every navigation/error flow.
- Accessibility work is source-level only. TalkBack/VoiceOver/NVDA, 200% browser zoom, full keyboard traversal, contrast measurements, player captions behavior and reduced-motion device tests remain unverified.
- The Android header was structurally changed to remain fixed while content scrolls, but no small-screen or notch emulator/screenshot verification was possible.

## Full-suite execution status

All requested commands remain **not run** in this execution environment:
- `bun run scan:public-text`
- `bun run check:secret-names`
- `bun run build`
- `bun x tsc --noEmit`
- `bun run lint`
- `bun run test`
- Android unit tests / Gradle verification

A local working tree could not be established in this execution environment; no local Bun, Gradle, Android SDK, emulator or browser runtime is available. GitHub file operations were used for source review and direct commits only. No passing build/test result is claimed.

## Overall state after the four-batch split

- Batch 1: scanner coverage improved and baseline status documented, but the actual scanner output/hit list and wording cleanup are still blocked by the missing runtime.
- Batch 2: source-level console authorization review completed for the 28 admin and 11 producer API route files; schema-inspector owner email mismatch fixed. Live security tests remain unrun.
- Batch 3: account/device theme persistence, initial theme application, shared component foundations and currency updates committed. Full screen-wide theme adoption and Learn More page-system integration remain.
- Batch 4: contact delivery and page/status foundations committed. Legal text approval, status-flow integration and full accessibility verification remain.

Producer Android screens, API client, repository, server routes and navigation remain preserved. The Android Downloads placeholder and tab have been removed; viewing remains online-only. File 01 is still not complete until the remaining work is implemented and all required checks run successfully.


## Final four-batch checkpoint — 2026-11-17

### Additional source corrections after the initial batch reports

- Website owner wording was cleaned in the storage locations, video studio, advertising settings, pricing, monthly reports and data-structure pages. The signed-in owner interface consistently uses the Zillionaire Dashboard name; no person is labelled Admin or Super Admin. The required owner identity setting is `ZILLIONAIRE_EMAIL`; no `ADMIN_EMAIL` setting is documented.
- The admin module card now uses a plain-language setup status instead of exposing an API label, and its storage visibility filter matches the current “Storage locations” title.
- The monthly reports page now uses exact minor-unit arithmetic for currency display and is excluded from search indexing.
- Android catalogue, channel, search, wallet, profile, sign-in, producer and player failures now use the central safe-message mapping instead of displaying raw exception text. Existing producer functionality remains intact.
- Android home header is fixed above the scrolling home content, still padded by the top safe-drawing inset.
- The contact form now sends to the support mailbox through the existing email delivery integration. The endpoint validates input and applies per-email rate limiting.

### Still blocked or incomplete

- **Actual scanner hit list:** still not generated. Scanner execution requires a full checkout and Bun runtime. The scanner was expanded and known wording findings were manually corrected, but this is not a substitute for its actual output.
- **Full website/Android wording cleanup:** known reported pages were corrected, but the entire source tree has not been scanned and confirmed clean.
- **Small-screen/notch verification:** Android and website layouts have source-level corrections and a manual checklist, but no screenshots or emulator/browser run was possible.
- **Complete shared-component adoption:** reusable foundations exist, but all screens have not been migrated; Learn More is not yet connected to the editable pages system.
- **Complete theme coverage:** persistence and account synchronization exist, but older screens still contain fixed colors. A different account preference is reconciled after sign-in, not before the first unauthenticated HTML paint.
- **Legal documents:** routes exist but remain publication-pending. Approved legal text and jurisdiction-specific review are required before publication.
- **Status-page integration:** route screens exist but are not wired to every corresponding maintenance, offline, waiting-room, age and territory decision.
- **Accessibility:** focus outlines, reduced motion, safe error messages, scalable Compose text and a subtitles control exist; full screen-reader, keyboard, 200% zoom, contrast and device testing remain outstanding.
- **Automated checks:** scanner, secret-name checker, website build, TypeScript, lint, unit tests and Android Gradle tests remain not run. No GitHub status checks were reported for the latest commit at the time of this report.

### Producer preservation

The Android Producer screen, API client, repository, navigation and website/server producer features were not deleted. The Android Downloads placeholder and navigation entry have been removed to keep the service online-only. This preserves the explicit instruction to keep producer code.

**File 01 remains incomplete and must not be marked complete.** The main blockers are actual scanner execution, full-tree cleanup confirmation, legal approval, full theme/component integration, status-flow integration and automated/device verification.

## Latest UI and stability continuation — 2026-11-17

### Badge 1 — Build blockers and dashboard identity
- Repaired the invalid storage form state setter in `src/routes/admin.storage.tsx`.
- Changed producer platform-upload authorization to use explicit content/channel module permissions instead of requesting an unsupported generic platform role. Updated the related permission test to assert the new safe error code and module-based access.
- Updated the public flags test to include the current public flags: `liveTv`, `forYou` and `reminders`.
- Reworded protected control pages to use **Zillionaire Dashboard** rather than Administrator/Admin labels. The owner identity remains `ZILLIONAIRE_EMAIL`; `ADMIN_EMAIL` is not part of the required secret list or owner checklist.
- Tightened the scanner exception so the word Zillionaire is allowed only inside protected dashboard route files.

### Badge 2 — Website discovery and status pages
- Added authenticated Movies and Series browse pages with poster grids, category filters, account-aware loading and empty/error states. These pages currently show featured published assets returned by the existing home catalogue endpoint; a complete unfeatured movie/series catalogue endpoint is still needed for full catalog coverage.
- Connected homepage Movies and Series quick-access links to the new pages and corrected featured-title links to use existing channel routes.
- Confirmed and reused the existing `/not-available` and `/high-demand` status routes; duplicate aliases were removed. The age-restriction page and reusable status-page component already existed.
- The homepage profile control now shows the signed-in member's initial, retains the generic person icon when signed out, and the bottom navigation has five destinations. The logo width has an intermediate compact breakpoint to avoid crowding at 400–430 px.
- Existing country-aware public configuration supplies the signed-out currency symbol; signed-in wallet summary continues to override it with the established wallet currency.

### Badge 3 — Android navigation and visual polish
- Android bottom navigation now uses five accessible Material vector icons: Home, Live TV, Library, Settings and Profile. The Downloads placeholder destination and Wi-Fi-only-download setting were removed; viewing remains online-only.
- Android account theme synchronization now gates the signed-in app surface until the saved account preference has been loaded, avoiding a visible theme switch after the home screen appears. The device preference still supplies the initial app theme.
- Fixed the home content container so the entire home feed scrolls beneath the top-inset-aware header. The header retains a 56 dp minimum row and 48 dp search, notifications and profile controls.
- Replaced quick-access text glyphs with Material vector icons and changed the Library catalogue to a two-column poster grid with horizontally scrollable category filters.
- The Android account view now shows a ringed member avatar and Viewer badge. Sign-in and registration surfaces now link to Terms and Privacy.
- Producer screens, API client, repository, routes and navigation remain intact.

### Badge 4 — Current verification and remaining limits
- The contact page submits through the existing validated, rate-limited contact API, which uses the configured email delivery service to send to `tv@bqsqwad.com`. Delivery has not been live-tested.
- Privacy, Terms and Producer Terms remain publication-pending legal shells; approved company/legal text is still required.
- Movies and Series pages are limited to featured content until a full catalogue endpoint is added.
- No Android emulator or browser screenshot was available, so small-screen/notch appearance is not visually verified.
- The public-text scanner, secret-name checker, website build, TypeScript check, lint, Vitest suite, Android Gradle unit tests and emulator tests remain **not run**. The repository workflows are configured for manual dispatch; no workflow dispatch action was available in this execution environment. No test or build pass is claimed.

**This continuation is source-committed but not build-verified. File 01 and the UI work remain incomplete pending the full catalogue API, complete component/theme adoption, legal approval, scanner output, and automated/device verification.**

## Final design and account-hub continuation — 2026-11-17

- Fixed website logo references in protected dashboard and producer pages that pointed to a non-existent SVG; all now use the uploaded `public/brand/bq-sqwad-tv-logo.png`. Android already uses the same uploaded PNG as its drawable. Removed the obsolete `public/favicon.ico`; the root document continues to reference the official PNG mark as the site icon. A separate 64×64 favicon file was not generated in this text-only GitHub editing environment.
- Added the official brand mark as an unobtrusive watermark in the Android and web players. Removed the previous Android player overlay that exposed part of a viewer identifier.
- Added a branded Android launch screen with the official logo, tagline, progress indicator and footer slogan. The signed-in app continues to wait for the account theme preference before rendering its main navigation.
- Added native Android Watch History and Notifications screens backed by the existing wallet-ledger and notification endpoints. Added profile shortcuts for wallet, purchases, history, notifications, producer studio, help and about; producer functionality remains intact.
- Added website Notifications and Watch History pages using the existing authenticated APIs. The signed-in account hub now links to wallet/purchases, watch history, notifications, help and about.
- Centralized website minor-unit formatting in `src/lib/format-money.ts`, using BigInt and locale-aware formatting. Wallet, content viewing rates and watch history use the same exact formatter. Added currency tests for NGN, USD, GBP, GHS, KES, ZAR, JPY and KWD, including negative subunit amounts.
- Added optional genre metadata to the existing featured catalogue response; Movies and Series filters now use that field. These pages still show featured published items only, not the full unfeatured catalogue.
- Removed outdated Supabase placeholders from `.env.example`. The only configured top-level owner identity remains `ZILLIONAIRE_EMAIL`; no `ADMIN_EMAIL` is required or listed. No person is labelled Admin or Super Admin in the product interface.
- Simplified storage-location form labels and hid internal connection-prefix/account identifiers from the visible form while preserving the existing registry payload and provider wiring.
- Added noindex metadata to the producer channel listing page. Crawler rules and noindex remain discovery hygiene only; API permissions are the security boundary.

### Verification status

- The reported storage setter syntax issue is corrected.
- The producer upload helper now checks the explicit content/channel module grants rather than requesting an unsupported platform role; the related test expectations were updated.
- The public flags test now includes the three public flags added earlier (`liveTv`, `forYou`, `reminders`).
- The new website currency formatter tests and Android history/notifications screens have **not** been executed. No website build, type-check, lint, Vitest, Android Gradle or emulator result is claimed.
- The brand PNG is the existing uploaded source and is referenced directly; a separate 64×64 padded PNG favicon was not generated. The official mark remains the linked site icon after removing the old ICO.
- Full screenshot verification at 320, 360, 390, 430 and 768 px, plus Android small-screen/notch emulator verification, remains outstanding.
