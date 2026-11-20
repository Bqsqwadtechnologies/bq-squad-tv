# V5-05 Viewer App Release Notes

## Delivered
- Viewer Home, Live TV, Library, Downloads placeholder, and Settings navigation for web and Android.
- Viewer player controls, resume state, playback speed, watchlist, Kids Safe Mode settings, notification/search surfaces, wallet top-ups and transaction history.
- Shared Google sign-in client configuration for web and Android with visible retry/disabled states.
- Android maintenance and force-update gates backed by public client settings; viewer-only public sitemap.

## Verification
- Web production build: passed.
- Public-text scan: passed.
- Targeted V5-05 tests through Batches 5–9: 25/25 passed in the final targeted run.
- Full repository suite: 3,209 passed, 14 failed across 130 test files. Failures include out-of-date route/role matrix fixtures, console guard expectations, a no-admin string assertion, a producer dashboard test, and one timing-sensitive viewer dashboard test. These remain release blockers for a clean full-suite sign-off.
- Android native compilation was not run: the repository has no Gradle wrapper and system Gradle is unavailable in this workspace.
- `check:secret-names` confirms required secret names are documented, but exits non-zero because their values are not present in this execution environment; values were not exposed.

## Known limitations
- Offline encrypted downloads remain deferred; the app clearly presents online-only availability.
- Some player preference selectors are UI preferences and need stream manifest/track metadata to actually switch audio/subtitle/quality tracks.
- Kids Safe Mode and watchlist state currently persist locally on the web device; cross-device sync/server-side PIN enforcement needs backend integration before being presented as account-wide protection.
