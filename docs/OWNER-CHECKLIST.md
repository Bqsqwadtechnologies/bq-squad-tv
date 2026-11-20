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
