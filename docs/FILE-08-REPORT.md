# File 08 — Legal Page Seed Text Report

**Status:** Draft seeding, owner settings, publication guard, public page reader, acceptance records and native settings links have been added to `main`. This is not a launch approval.

## Completed
- Added five default Markdown drafts: `privacy-policy`, `terms`, `producer-terms`, `producer-policy` and `provider-terms`.
- Added a validation script and an owner-only, create-if-absent seed endpoint. Existing documents are never overwritten by seeding.
- Added the owner dashboard action **Load default pages**, the placeholder reference table and audited fields for legal settings.
- Added an owner-only publishing endpoint. It fills placeholders from saved settings, blocks missing values and raw HTML/unsafe links, requires a recent owner sign-in, increments the version, preserves version history and records an audit reason.
- Added a public legal-page read endpoint and a website route. Only published public-audience pages are exposed publicly.
- Added versioned acceptance records for public, producer and provider audiences. Session start checks public acceptance; producer verification checks public and producer acceptance. A published version marked `requiresReacceptance` requires acceptance of that exact version.
- Added Android sign-up/profile setup acceptance for Terms and Privacy Policy and updated native settings/sign-in links.
- Added public website footer links to Privacy Policy, Terms, Cookie Notice (currently points to the Privacy Policy cookie section) and Contact.

## Commits
- `401488d` — five legal draft templates
- `6343706` — seed script
- `86fc1bf` — owner seed endpoint
- `5ed6e82` — public legal read endpoint
- `3afcdf3` — owner dashboard load action and placeholder table
- `0bd44eb`, `307e681`, `574489d` — legal acceptance helper and routes
- `ff6745d`, `bd27fa2` — session and producer verification acceptance gates
- `360b68a` — public legal page route
- `0028d94`, `fcd70bc` — Android settings and website footer links
- `99f230b`, `b30c0a6`, `e5dc83e`, `159a309` — publish guard and owner legal settings
- `5612e3e`, `81c7e59`, `d11c27e`, `804bb6c`, `a406546` — native acceptance API, profile setup and sign-in links
- `15cab49`, `f1abfb2`, `cf62d4e` — placeholder helper and legal tests
- `046d452`, `adb100b`, `f88d414`, `dc27b97`, `577d369`, `738ea16`, `20480bb` — validation and reacceptance corrections
- `1603b2b` — publish validation corrections
- `b30c0a6` — owner settings endpoint
- `159a309` — owner placeholder form

## Verification
- Unit tests: **not run** — no repository runtime or dependency installation was available in this session.
- `scripts/scan-public-text.mjs`: **not run** for the same reason. The legal source was reviewed against the scanner's configured prohibited-term list, but that is not a substitute for running the scanner.
- Website build, typecheck, Android build and device QA: **not run**.
- No production Firestore writes were performed. The owner seed action has not been executed.
- No claims are made that routes are deployed or live.

## Remaining work / launch blockers
- No complete legal draft editor/preview/rollback screen has been added; the owner settings and publish API exist, but content editing must be completed in the website console before routine use.
- The provider invitation flow and provider-console acceptance UI are not present in the inspected tree. The provider audience and acceptance API are prepared, but invitations are not yet wired.
- The web sign-up surface was not present in the inspected route tree; native sign-up/profile setup now records acceptance.
- Public legal pages remain unavailable until the owner loads drafts, completes placeholders, obtains qualified legal review and publishes.
- Confirm that the Cookie Notice content and every privacy statement match actual deployed behaviour before publication.

## Legal review notice
**These documents are drafts. They must be reviewed by a qualified lawyer in every country where BQ SQWAD TV operates before launch. The owner must edit them whenever an actual product practice changes.**
