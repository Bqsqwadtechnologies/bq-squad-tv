# Header Responsive QA Checklist

The header now uses a compact logo below 400 CSS pixels, keeps the account action first and wallet second, and replaces the search/notification pair with one overflow menu below 381 CSS pixels.

## Manual viewport checks

Run the website locally and inspect the home page at each viewport. Verify no horizontal scrolling, the profile/account action remains visible, the wallet remains visible, and the overflow menu opens and closes.

- [ ] 320 px — compact logo; account and wallet controls remain fully visible; overflow menu contains Search and Notifications.
- [ ] 360 px — same compact layout; no clipping or horizontal scrolling.
- [ ] 390 px — full action group fits; Search and Notifications are visible.
- [ ] 430 px — full action group fits with comfortable spacing.
- [ ] 768 px — desktop/tablet navigation and action group remain aligned.
- [ ] Device with a display cutout — top header content clears the status bar and safe area.
- [ ] Keyboard — overflow button can be focused and toggled; menu links/buttons are keyboard reachable.

## Execution status

Not run in this environment: no local browser, Playwright runtime, or checked-out working tree was available. This checklist is not evidence that the viewports have been visually verified.


## Android home-header follow-up (2026-11-17)

- The home header now remains outside the vertically scrolling content, so it stays fixed while the channel rails scroll.
- The full header is wrapped in `WindowInsets.safeDrawing.only(WindowInsetsSides.Top)`, which includes the safe top region and display cutout insets.
- The row has a 56 dp minimum height; the search, notifications and profile controls are 48 dp.
- The profile control shows the signed-in member's initial in a ringed circle and has a Profile content description.

**Verification remains outstanding:** no Android emulator, screenshot test or device was available. In particular, the 320 dp compact width and a cutout/notch layout have not been visually inspected.
