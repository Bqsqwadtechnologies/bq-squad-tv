# File 08 — Legal Page Seed Text Report

**Implementation status: source implementation substantially complete; not launch-ready and not fully verified.** All source changes were committed directly to `main`. No production Firestore writes were performed.

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
- Version changes marked `requiresReacceptance` require acceptance of the exact new version. Website sign-in now checks current acceptance and presents updated public documents before allowing the account flow to continue.
- Website account creation requires an explicit Terms and Privacy checkbox, verifies that both pages are published, records acceptance, and only then completes the profile. The profile-completion endpoint independently enforces the acceptance record.
- Legal page templates now have one canonical JSON source shared by the owner seed API and the standalone validation script. Published page audience is checked against the requested audience to prevent cross-audience document substitution.
- Added unit coverage for audience-specific required documents, wrong-audience pages, draft and placeholder rejection, exact-version reacceptance and legacy acceptance when reacceptance is not required.

## Not completed
- Provider invitations: the provider invitation workflow is not present, so provider-term acceptance is not connected to an invitation flow. Provider acceptance remains available through the protected audience-specific acceptance endpoint for integration by the provider workflow.
- Provider invitations: the provider invitation workflow is not present, so provider-term acceptance is not connected to an invitation flow.
- The provider audience and acceptance endpoint exist, but the provider console/invitation UI remains a File 06 dependency.
- There is no complete owner page editor/preview/rollback UI in the current website tree. The owner settings and publishing endpoints exist, but routine editing of page Markdown still needs the File 06 editor.
- The cookie-notice footer item currently points to the cookie section in the Privacy Policy; there is no separate Cookie Notice document.
- The owner must load the drafts, fill every placeholder, review the actual content, and publish. Until then, public legal pages and session starts remain blocked by design.

## Verification
- `scripts/scan-public-text.mjs`: **not run**. The repository runtime was not available in this session. No claim of a clean scan is made.
- New `src/test/legal-acceptance.test.ts` coverage was committed but has not been executed.
- Vitest: **not run**.
- Website typecheck/build and Android build: **not run**.
- Browser and device QA: **not run**.
- The legal test file was added, but its assertions have not been executed.

## Required legal review
**All five documents are drafts. They must be reviewed by a qualified lawyer in every country where BQ SQWAD TV operates before launch. The owner must edit the documents whenever an actual product practice changes.** In particular, the owner must confirm minimum age, retention periods, charge dispute window, wallet refund and closure rules, liability terms, governing law, jurisdiction, postal address if required, producer revenue basis, notice period and minimum payout. Provider terms must match each signed provider contract.

## Remaining work and dependencies

- The provider invitation flow and provider console are File 06 dependencies; provider acceptance must be called by that flow before invitation activation.
- The owner still needs a complete Markdown editing, preview, diff and rollback interface. Current owner controls cover safe initial seeding, placeholder settings and publication but not the full editorial workflow.
- Android initial acceptance is implemented in profile setup; Android sign-in reacceptance must be verified and completed against the same authenticated status endpoint before claiming cross-platform parity.
- The Cookie Notice footer link currently leads to the cookie section in the Privacy Policy; there is no standalone Cookie Notice document.

## Dependencies outside File 08
This work does not complete the remaining implementation and verification in Files 02–07. Those files must be audited and finished separately before File 09 or launch is treated as unblocked.
