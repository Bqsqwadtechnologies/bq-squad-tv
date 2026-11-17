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
