# BQ SQWAD TV — Admin, Video and Legal Publishing Repair Status

**Date:** 20 November 2026  
**Branch:** `main`  
**Repository:** `Bqsqwadtechnologies/bq-squad-tv`

## Scope inspected

The repository tree and implementation areas inspected include Zillionaire admin routes and generated registrations, shared console navigation, admin video and upload studios, content-asset listing, producer upload intent/completion, public legal rendering, owner-only legal draft/seed/publish APIs, bundled legal drafts and their validation test.

## Changes committed

1. Corrected the legal-page dashboard loader dependency so it tracks the `token` used by its authenticated request rather than `account.token`.
2. Added a Provider Privacy Notice as a bundled **draft**, for owner review and completion.
3. Added public lookup aliases for `provider-privacy` and `provider-privacy-policy`.
4. Added public lookup through `/legal/provider-privacy` using the existing legal slug route.
5. Added provider privacy and provider terms links to the public legal-document footer.
6. Updated the legal-page test to require the new provider privacy draft and verify its provider audience.

## Confirmed architecture findings

### Admin navigation

The repository contains a large set of Zillionaire page files and the generated route tree registers the main admin pages, including approvals, analytics, channels, live TV, movies, series, upload studio, moderation, finance, payments, payouts, policies, security, storage, team, video studio and wallets.

Static inspection does not reproduce the reported browser 404s. A route being present in source does not prove that the deployed hosting environment serves it correctly. The deployed URL, failing path, HTTP response and server logs are still needed to isolate deployment rewrites, stale deployment output or API failures.

### Video visibility

Producer upload intent and completion use the `contentAssets` collection. The admin content-asset listing API also reads `contentAssets`, while the Zillionaire upload studio has a separate upload-management endpoint that reads the same collection.

The source therefore shows a shared collection, not an intentional producer/admin collection split. Actual visibility still needs a test upload and authenticated read against the configured Firestore project. No production Firestore data was accessed or modified during this source review.

### Legal publication

The legal seed endpoint deliberately creates drafts and leaves existing records unchanged. The public legal-page API only marks a Firestore page as published when its stored status is published (or a scheduled publication is due).

The owner-only publish endpoint requires a recently authenticated owner session, completed legal settings and no unresolved placeholders. Committing policy text to GitHub or seeding a draft does **not** publish a live policy record.

Several existing legal drafts contain business-specific placeholders, including payout, retention, governing-law, jurisdiction and dispute terms. These must be confirmed by the platform owner and reviewed by qualified counsel before publication. The new Provider Privacy Notice is also explicitly a draft pending confirmation of its retention schedule.

## Not yet verified or completed

- Live browser reproduction of each reported admin 404.
- Production deployment and host rewrite configuration.
- Authenticated admin video-list request against the configured Firestore project.
- Admin test-video upload, transcode, approval and publication end-to-end.
- Actual Paystack checkout and webhook reconciliation.
- Google Sign-In in the deployed website and Android app.
- Owner-authenticated legal-page publication in Firestore.
- Legal review and completion of unresolved commercial/legal placeholders.
- Full website and Android release builds.
- CI rerun after the latest legal-route and test-matrix corrections.

## Release gate

Do not describe the platform as fully repaired or production-published until the relevant deployment, authenticated integration tests and release builds pass. Do not publish legal drafts automatically, fabricate payment or video records, or modify existing wallet and ledger history.
