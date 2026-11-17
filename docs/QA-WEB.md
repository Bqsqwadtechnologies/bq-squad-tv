# BQ SQWAD TV — Website QA

Status: checklist prepared; browser execution has not been performed.

Record browser/version, viewport, device, commit SHA, date and each result. Use test accounts and provider sandbox credentials only. Never use real payment details for QA.

## Responsive navigation
- [ ] Check 320, 360, 381, 390, 430, 768, 1024 and 1440 CSS-pixel widths.
- [ ] Phone navigation shows Home, Live TV, Library, Search and Account; desktop navigation remains usable.
- [ ] Profile/account action and wallet remain visible where specified; menus open, close and are keyboard accessible.
- [ ] No horizontal page scrolling, clipped text or controls hidden behind safe areas.
- [ ] Browser back/forward and direct deep links behave consistently.

## Legal acceptance
- [ ] New account creation requires the Terms and Privacy Policy checkbox and both pages to be published.
- [ ] Profile completion rejects requests without current legal acceptance.
- [ ] A `requiresReacceptance` version change prompts the next sign-in and blocks the account flow until accepted.
- [ ] Producer Console displays all four required documents and withholds workspace data until acceptance.
- [ ] Loading default pages creates draft version 1 only for missing slugs; existing edits remain unchanged.
- [ ] Publishing lists every missing placeholder and rejects raw HTML or unsafe links.

## Home, catalogue and search
- [ ] Featured content, category tiles and catalogue rows load with loading, empty and error states.
- [ ] Every priced title shows the correct server-provided per-minute amount and currency.
- [ ] Search returns only published, rights-cleared, territory-eligible and age-eligible results.
- [ ] Movie/channel detail pages show synopsis, artwork, rating, age guidance, price and Learn more where available.
- [ ] Adult-only content is not exposed to ineligible accounts through search, home rows, links or notifications.

## Wallet and playback
- [ ] Wallet summary, ledger, payment history and receipts use server-formatted currency.
- [ ] Daily limits and optional monthly budget are understandable and update correctly.
- [ ] Paystack checkout uses a provider sandbox; test success, cancellation, failure, duplicate callbacks and wrong-amount rejection.
- [ ] Playback starts only after server authorization; test heartbeat, pause, resume, end and network interruption.
- [ ] Player shows the running charge and clear buffering, low-balance, rights and high-demand messages.
- [ ] No viewer download link, browser download control or unintended picture-in-picture stream exposure.

## Accessibility, security and themes
- [ ] Keyboard-only navigation, visible focus, screen reader labels and zoom to 200%.
- [ ] Normal and white themes across pages, dialogs, menus, charts and player.
- [ ] Reduced-motion preference is respected.
- [ ] Console routes return generic not-found responses to unauthorized users and include noindex metadata.
- [ ] No secrets, private source URLs, provider credentials or stack traces appear in page source, network responses or logs.
- [ ] Cookie-authenticated writes reject cross-site requests and invalid CSRF tokens.
- [ ] Verify security headers on public pages and each console route.

## Evidence and sign-off
Record pass/fail, reproduction steps and the exact commit SHA for every failure. Do not mark a provider integration, payment, playback path or console as production-ready solely because the page renders.
