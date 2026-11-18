# BQ SQWAD TV — V3 Design System & Brand Asset Pipeline

## 1. Brand Identity & Source References
- **Brand name:** BQ SQWAD TV
- **Tagline:** WATCH • STREAM • ENJOY
- **Subline:** Entertainment Without Limits
- **Logo artwork rule:** Everywhere the words "BQ SQWAD TV" are printed as a brand emblem or logo mark (headers, splash, sign-in, status pages, emails, footers, console headers), the brand image asset is rendered via `<BrandLogo />` or Android drawables rather than typed plain text. Plain text is reserved for page titles, legal copy, and accessibility labels.

## 2. Asset Pipeline
- **Generator script:** `scripts/build-brand-assets.py` (wrapped by `scripts/build-brand-assets.mjs`).
- **Inputs:** `public/brand/bq-sqwad-tv-logo.png`
- **Generated Web Assets (`public/brand/`):**
  - `logo-horizontal.png` — Scaled transparent horizontal logo
  - `icon-mark.png` — Square gloss emblem (512x512)
  - `og-image.png` — OpenGraph preview banner (1200x630)
  - `splash.png` — High-resolution splash banner (1080x1920)
  - `favicon-32.png` & `favicon-16.png`
  - `apple-touch-icon.png` (180x180)
  - `pwa-192.png` & `pwa-512.png`
- **Generated Android Assets (`android/app/src/main/res/`):**
  - `drawable/bq_sqwad_tv_mark.png` (512x512)
  - `drawable/splash_branding.png` (720x1280)
  - `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher.png`
  - `mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_round.png`

## 3. Design Tokens (`design/tokens.json`)
Synced across platforms using `scripts/sync-design-tokens.mjs`:
- Web CSS tokens in `src/styles.css`
- Android Material 3 tokens in `Color.kt` and `Theme.kt`
- **Default Theme:** Dark navy (`#030B2A` to `#0A1A4A`) with electric-blue (`#0052D4`) and cyan (`#00D8F5`) accents.
- **Light Theme:** High-contrast clean white with charcoal typography (`#0A1329`) and vivid blue buttons.

## 4. Shared Copy Catalogue (`content/strings/en.json`)
Synced across platforms using `scripts/sync-strings.mjs`:
- Web exports in `src/lib/strings.ts`
- Android string resources in `android/app/src/main/res/values/strings.xml`

## 5. Accessibility & Contrast (WCAG AA)
- Touch targets: minimum 48x48 dp / 44x44 px on all interactive controls.
- Contrast ratio >= 4.5:1 for standard body text and >= 3:1 for large display headers.
- Keyboard navigation: visible focus rings with `outline: 2px solid var(--ring)`.
- Screen reader accessibility: full aria labels and Android content descriptions on all icons, navigation tabs and media controls.

## 6. Screen Gallery Checklist
1. **Splash Screen:** Branded animated screen with logo mark, spinner ring and tagline.
2. **Home Screen:** Responsive top bar, hero banner with page dots, Quick Access glossy tiles, Trending Now poster row with live currency price chips, and glowing bottom nav.
3. **Profile Screen:** Large avatar, Viewer chip, wallet balance display, grouped action rows, and safe sign-out confirmation.
4. **Wallet Screen:** Gradient available balance card, Top Up flow, and artwork empty transaction state.
5. **Settings Screen:** Grouped lists for playback quality, Wi-Fi streaming, parental controls PIN, security sessions, and legal pages.
6. **Channel Player Screen:** Glowing cyan progress bar, volume slider, live red dot indicator, PiP and fullscreen controls.
7. **Search Screen:** Real-time query search, category pills (All, Live TV, Movies, Series, Kids), voice search support, and suggestion pills for empty states.
8. **Producer & Provider Studios:** Deep navy layout, cyan badges, glowing active navigation tabs, and dark/light parity.
