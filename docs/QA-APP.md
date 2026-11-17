# BQ SQWAD TV — Android device QA

Status: checklist prepared; device execution has not been performed.

Run on a physical Android phone after installing the same release candidate that passed CI. Record device model, Android version, app version, commit SHA, date and each result. Do not test with a real payment unless the account owner has explicitly approved the provider's sandbox/test environment.

## Navigation and layout
- [ ] Bottom tabs are Home, Live TV, Library, Search and Account, with icons and readable labels.
- [ ] Each tab responds once, preserves expected back-stack state and has a touch target of at least 48 dp.
- [ ] Account > Settings remains reachable.
- [ ] Back from a detail page returns to the previous screen; back from a root tab does not unexpectedly exit.
- [ ] Deep links from supported notifications open the correct screen and invalid links fail safely.

## Display and accessibility
- [ ] Check 320 dp, 360 dp, 393 dp and 432 dp widths; no clipped controls or horizontal overflow.
- [ ] Check status bar, camera cutout, gesture navigation area, keyboard and landscape rotation.
- [ ] Check normal and white themes on every screen, dialog, menu and player control.
- [ ] Check Android large text, display scaling, TalkBack labels and focus order.
- [ ] Check reduced-motion/system animation settings.

## Viewer journeys
- [ ] New account creation is blocked until published Terms and Privacy Policy are reviewed and accepted.
- [ ] After a legal version requiring reacceptance is published, the next sign-in displays both current documents and blocks entry until accepted.
- [ ] Producer onboarding displays Terms, Privacy Policy, Producer Terms and Producer Content Policy; acceptance is saved before producer data is shown.
- [ ] Sign in, complete profile, set country and confirm displayed currency.
- [ ] Browse home, open a movie/channel, inspect rating, territory and price information.
- [ ] Search titles and channels; verify unavailable or age-restricted content is not exposed.
- [ ] Open wallet summary, history and receipt; verify currency formatting for 0-, 2- and 3-decimal currencies.
- [ ] Start playback in an approved test environment; verify the rating notice, captions/audio/quality controls, running charge, heartbeat and clean session end.
- [ ] Simulate network loss and recovery; verify friendly errors and retry behaviour.
- [ ] Verify low-balance and high-demand states without spending real money.
- [ ] Verify account devices, notification preferences, parental controls and sign-out.

## Player and process lifecycle
- [ ] Verify screen capture protection is active only while the player is visible.
- [ ] Verify no offline download action or local media download is offered to viewers.
- [ ] Rotate, background and restore the app; confirm the session is not duplicated and billing state is recovered safely.
- [ ] Kill the process during a test session and relaunch; verify the server's session state is authoritative.
- [ ] Verify push notification permission and each notification channel.

## Evidence
Attach screenshots or screen recordings only where permitted by the test content and device policy. Never include payment credentials, private licence material, access tokens or personal identity documents.
