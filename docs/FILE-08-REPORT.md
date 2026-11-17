# File 08 — Legal Page Seed Text Report

**Implementation status: partially complete; not launch-ready.** All source changes were committed directly to `main`. No production Firestore writes were performed.

## Implemented
- Five draft templates: Privacy Policy, Terms and Conditions, Producer Terms, Producer Content Policy and Licensed Channel Provider Terms.
- `scripts/seed-pages.mjs` validates the five expected slugs and placeholder list. The owner-only seed endpoint creates version 1 drafts only when a slug does not already exist.
- Owner dashboard action **Load default pages**, a placeholder reference table and audited settings fields.
- Owner-only publish endpoint with recent-sign-in check, audit reason, version history, placeholder substitution, missing-value blocking, raw-HTML rejection and HTTPS/mailto-only Markdown link validation.
- Public read endpoint and website legal-page route. Only published public-audience pages are exposed to unauthenticated readers.
- Versioned acceptance records and required-page endpoint for public, producer and provider audiences.
- Public acceptance is checked before a viewing session starts. Producer acceptance is checked before producer verification.
- Native Android profile setup requires acceptance of Terms and Privacy Policy before profile completion. Android sign-in and settings links point to the new legal paths.
- Public website footer links to Privacy Policy, Terms, Cookie Notice and Contact. Legacy `/privacy` and `/terms` paths redirect to the new legal pages.
- Version changes marked `requiresReacceptance` require acceptance of the exact new version.

## Not completed
- Website sign-up: no dedicated sign-up route was present in the inspected website route tree, so website registration acceptance is not wired.
- Provider invitations: the provider invitation workflow is not present, so provider-term acceptance is not connected to an invitation flow.
- The provider audience and acceptance endpoint exist, but the provider console/invitation UI remains a File 06 dependency.
- There is no complete owner page editor/preview/rollback UI in the current website tree. The owner settings and publishing endpoints exist, but routine editing of page Markdown still needs the File 06 editor.
- The cookie-notice footer item currently points to the cookie section in the Privacy Policy; there is no separate Cookie Notice document.
- The owner must load the drafts, fill every placeholder, review the actual content, and publish. Until then, public legal pages and session starts remain blocked by design.

## Verification
- `scripts/scan-public-text.mjs`: **not run**. The repository runtime was not available in this session. No claim of a clean scan is made.
- Vitest: **not run**.
- Website typecheck/build and Android build: **not run**.
- Browser and device QA: **not run**.
- The legal test file was added, but its assertions have not been executed.

## Required legal review
**All five documents are drafts. They must be reviewed by a qualified lawyer in every country where BQ SQWAD TV operates before launch. The owner must edit the documents whenever an actual product practice changes.** In particular, the owner must confirm minimum age, retention periods, charge dispute window, wallet refund and closure rules, liability terms, governing law, jurisdiction, postal address if required, producer revenue basis, notice period and minimum payout. Provider terms must match each signed provider contract.

## Dependencies outside File 08
This work does not complete the remaining implementation and verification in Files 02–07. Those files must be audited and finished separately before File 09 or launch is treated as unblocked.
