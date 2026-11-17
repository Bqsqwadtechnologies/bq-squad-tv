# Accessibility Review

Date: 2026-11-17

## Implemented in this foundation pass

- Website header has accessible names for account, wallet, search, notifications and overflow actions.
- Android home actions use Material vector icons with content descriptions and 48 dp touch targets.
- Android home content now applies the top safe-drawing inset before rendering the header.
- Website and Android semantic theme palettes now include light and dark variants.

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
