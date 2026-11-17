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
