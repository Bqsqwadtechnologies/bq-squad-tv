# V5-05 Owner Release Checklist

Run this in order on the published web app and the Android build. Do not mark release-ready until every item is verified and all listed blockers below are cleared.

1. Sign in as the owner with 2FA and the access password; confirm the owner control centre opens only for the configured owner.
2. Open Zillionaire, Producer, and Provider consoles separately; verify each role sees only its own dashboard and allowed actions.
3. Attempt provider access as an unapproved provider; confirm access is denied, then approve a test provider and confirm the correct portal opens.
4. Create a producer account, finish verification, and confirm the Producer Console is available only after approval.
5. Upload a test video, verify its processing state, metadata, thumbnail, schedule, and final publish action.
6. Open the viewer app on web and Android; tap Home, Live TV, Library, Downloads, and Settings in order and confirm each opens the expected screen.
7. Start a paid playback session, verify the per-minute meter and balance are visible, pause/resume, and confirm a low-balance stop links to Wallet top-up.
8. Post a comment on a test title, reply to it, edit/delete your own comment, and report another test comment; verify role and ownership checks.
9. Rate a title, add it to Watchlist, remove it, and confirm the Library reflects both actions.
10. Enter the Parent PIN flow, enable Kids Safe Mode, verify its visible state, and confirm restricted content is gated before release.
11. Send a live chat message, test slow mode and moderation, and confirm messages update in the player.
12. Open Wallet, complete a small Paystack test top-up, verify the server-confirmed balance, inspect transaction details, and confirm there is no withdrawal action.
13. Confirm per-minute usage appears in the wallet and player; test the low-balance alert and stop behavior.
14. Set a producer revenue share and verify a test viewing session produces the expected split in statements.
15. Mark an approved test payout PAID and verify the intended notification arrives; do not use a real payout until approved.
16. Search for a test user by email, request a password reset, and confirm the reset email and verification flow.
17. Block a test video, revoke playback tokens, then delete the test video and verify it cannot be streamed.
18. Add a test console team member with a least-privilege role and confirm access is limited to its assigned modules.
19. Publish and review Terms and Privacy pages; confirm legal acceptance works on new account signup.
20. Create and preview an ad unit, then send a test broadcast notice and verify notification delivery.
21. Run the owner test lab and save its results; complete the security scan and confirm no unresolved critical findings.
22. Verify Android maintenance and force-update screens against configured values; validate app store data-safety answers, deletion flow, privacy URL, and content rating.
23. Open `/sitemap.xml`, confirm only viewer-facing URLs are listed, and verify `/robots.txt` references the sitemap.
24. Run `bun run build`, `bun run scan:public-text`, `bun run check:secret-names`, and `bun run test`; record the actual totals and resolve all failures before calling the release complete.

## Current recorded verification
- Build: passed.
- Public-text scan: passed.
- Targeted V5-05 tests: 24 passed, 0 failed.
- Full suite: 3,209 passed, 14 failed (130 files); release sign-off is blocked until the known failures are reviewed and fixed.
- Android native compile: not run because no wrapper or system Gradle was available.
- Secret values are not present in this workspace execution environment; required secret names are documented in `docs/OWNER-ACTIONS.md`.


## V6 Release Readiness — Owner Actions Still Required

- [ ] Generate and securely back up the Android upload keystore. Configure `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD` only in the build secret manager; never commit values or the keystore.
- [ ] Build and install a debug APK on a supported Android device; build a signed release AAB/APK using JDK 17+ and Android SDK tools, then verify the signing certificate and perform an internal Play test.
- [ ] In Play Console, verify the actual Data Safety answers against production SDK behavior, complete the IARC content-rating questionnaire, set the privacy policy URL, and test the in-app and web account-deletion flows before submission.
- [ ] Confirm `compileSdk`/`targetSdk` requirements against current Play Console requirements and update app versionCode for each upload using `node scripts/bump-version-code.mjs`.
- [ ] Run the complete route-integrity check, lint, full test suite, type-check, build, public-text scan, and secret-name check; resolve and document all failures.
- [ ] Manually verify navigation/back behavior on web and Android, role boundaries, wallet/Paystack test mode, and the exact user-facing release flows in the checklist above.
- [ ] Have legal counsel approve published privacy, terms, producer, and provider policies; verify all listed public URLs are reachable before launch.

### V6 Verification Record (2026-11-20)
- Build: passed (`bun run build`).
- Public-text scan: passed (`bun run scan:public-text`).
- Batch 9 release readiness tests: 4 passed.
- Android native compilation: not run; this environment lacks JDK/Android SDK tooling.
- Type-check and lint: existing repository-wide failures recorded during this work; release sign-off remains blocked until reviewed and resolved. Full suite passed in this environment (3,465 tests); Android native compilation remains unavailable.
- Route-access matrix: generated 278 routes. `bun run check:route-integrity` now passes for 310 generated route files with no duplicate paths.
- Lint: failed on pre-existing repository-wide formatting/type lint findings (details in validation logs).
- Secret-name check: documented names pass; check exits nonzero because these required secret names are absent from this sandbox environment, and no values were printed.
