# Accessibility Review

Date: 2026-11-17

## Implemented in this foundation pass

- Website header has accessible names for account, wallet, search, notifications and overflow actions.
- Android home search and notifications use Material vector icons with content descriptions and 48 dp touch targets; the profile action now shows the signed-in member's initial in a 48 dp ringed button.
- Android home content applies the top safe-drawing inset before rendering the header, and the header row has a 56 dp minimum height.
- Website and Android semantic theme palettes now include light and dark variants.

- Website header duplicate Search-link attribute was removed; no browser build or visual regression test was available.

## Not yet verified

- Full keyboard navigation and visible focus rings across every website route.
- Screen-reader traversal across every page and dialog.
- Text scaling to 200 percent without clipping.
- Reduced-motion preferences across all animations.
- Captions control in the video player.
- Colour contrast measurements for every state, chart, form and player control.
- 44 px/48 dp touch-target audit for every shared and platform-specific control.
- Android notch and small-screen emulator screenshot tests.

## Required QA

Complete the checks above on real browsers and Android emulator/device before describing accessibility as verified. The current code changes have not been tested with assistive technology or contrast tooling.


## Batch 4 additions (2026-11-17)

- Added visible global `:focus-visible` outlines for links, buttons, form fields, summaries and explicitly focusable elements.
- Added a `prefers-reduced-motion: reduce` override to minimize animation and transition durations and disable smooth scrolling.
- Added reusable status-page layouts for maintenance, offline, high demand, country unavailability and age restriction.
- Added Android Compose status screens with clear messages and 48 dp minimum primary actions.
- Added About and Contact pages. The contact form submits to the existing validated and rate-limited contact endpoint, which uses the configured email delivery service to send to `tv@bqsqwad.com`. Live delivery has not been verified.
- Added Privacy, Terms and Producer Terms route shells. They are intentionally marked **Publication pending** and set to noindex; they are not approved legal policies and must not be treated as final terms.
- Added date of birth to website registration and connected it to the existing profile-completion endpoint. Added Terms and Privacy links to the registration flow.
- Added homepage links to About, Contact, Privacy and Terms; Android Settings links to About, Privacy and Terms.

## Accessibility verification status

Source changes made:
- Keyboard focus indicator: implemented globally in CSS.
- Reduced-motion preference: implemented globally in CSS.
- Android Compose text uses scalable `sp` typography in the inspected screens; no fixed-pixel text sizing was introduced by the new status screens.
- New Android status actions and settings controls use Material controls with minimum 48 dp touch sizing.
- New website form controls use labels and visible focus styling; contact fields have native input types and required constraints.

Not verified:
- Screen-reader pass on TalkBack, VoiceOver or NVDA.
- Keyboard-only traversal of every route and modal.
- Browser zoom at 200 percent across every page.
- Contrast measurements for every legacy screen, chart, player control and dialog.
- Captions toggle behavior in the player.
- Motion behavior in an actual reduced-motion browser/device setting.
- Small-screen and notch screenshots for Android.
- Website 320/360/390/430/768 px screenshots.

No accessibility conformance claim is made. Automated and manual checks remain required.


- The Android player already exposes a **Subtitles** track-selection control; the current work retained it. Its behavior and accessibility labels were not tested on a device.
- Recent wording cleanup replaced raw exception text from Android catalogue, channel, search, wallet, profile, sign-in, producer and player flows with the central safe-message mapping. This avoids exposing vendor/library error details to people using the app.


## Latest navigation and responsive updates (2026-11-17)

- Website profile control displays the signed-in member's initial and retains a generic person icon when signed out.
- Website bottom navigation includes five destinations; logo sizing has a compact intermediate breakpoint for 400–430 px widths.
- Android bottom navigation uses five Material vector icons with accessible labels. The home feed now scrolls below a fixed, safe-inset-aware header; quick-access tiles use vector icons.
- Android Library uses a two-column poster grid. The account screen displays a ringed avatar and Viewer badge.
- Sign-in and registration now expose Terms and Privacy links.
- These are source-level changes only. No small-screen browser screenshot, notch emulator, TalkBack, keyboard, 200% zoom or contrast verification was run.
