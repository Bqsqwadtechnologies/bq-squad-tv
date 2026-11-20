# V5-05 Viewer App Release Notes

## Delivered
- Viewer Home, Live TV, Library, Downloads placeholder, and Settings navigation for web and Android.
- Viewer player controls, resume state, playback speed, watchlist, Kids Safe Mode settings, notification/search surfaces, wallet top-ups and transaction history.
- Shared Google sign-in client configuration for web and Android with visible retry/disabled states.
- Android maintenance and force-update gates backed by public client settings; viewer-only public sitemap.

## Verification
- Web production build: passed.
- Public-text scan: passed (0 errors).
- Route & Role Security Matrix: 261 routes audited and fixtures updated (2,612 matrix tests + 16 deny-by-default fuzz tests passed).
- Console Guards & Portals: Producer, Provider, and Zillionaire console isolation tests verified (19/19 passed).
- Producer Dashboard: StatementsSettlementView import resolved (1/1 passed).
- Viewer Dashboard: 5/5 tests passed with live referral modal, KPI gradient cards, continue watching, and quick access navigation tiles.
- Google Authentication Config: Shared web and Android config test passed (1/1 passed).
- Android Compilation & CI: Added `.github/workflows/android-debug-apk.yml` providing automated debug APK packaging with SDK 36 and Gradle 8.13 via GitHub Actions (workflow_dispatch enabled). Added missing LaunchedEffect import to `SignInScreen.kt`.

## Known limitations
- Offline encrypted downloads remain deferred; the app clearly presents online-only availability.
- Some player preference selectors are UI preferences and need stream manifest/track metadata to actually switch audio/subtitle/quality tracks.
- Kids Safe Mode and watchlist state currently persist locally on the web device; cross-device sync/server-side PIN enforcement needs backend integration before being presented as account-wide protection.
