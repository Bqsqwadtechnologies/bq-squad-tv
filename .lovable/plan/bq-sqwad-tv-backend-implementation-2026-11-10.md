# BQ SQWAD TV backend implementation

## Goal

Build the shared Firebase-backed API for the website and Android app, keeping Firebase Admin and payment credentials server-side and preserving the documented Android request/response contract.

## Plan

1. Add a narrowly scoped, Firebase-authenticated admin inspection endpoint and verify the current Firebase service account can read the existing Firestore database. Inspect collection names and representative field shapes only; do not change or seed existing records during discovery.
2. Implement server-only Firebase token verification and Firestore access following the observed schema, including profile completion and age checks. Add the documented catalogue, wallet, session, ads, device, and producer API routes only where existing data and rights support them; unavailable stream/provider data must remain explicitly unavailable.
3. Add Paystack server-side configuration, initialization, verification, and signature-verified webhook handling. Add Google Play purchase verification only with the configured service-account credential and required Play Console access; Firebase credentials alone do not establish Play access.
4. Run focused tests and preview requests for reachable routes, inspect build/runtime logs, and document integrations that remain blocked by missing schema, catalog rights, provider setup, or permissions.

## Technical details

- Keep the existing TanStack Start + Cloudflare-compatible hosting target; use raw `fetch` and Web Crypto rather than Node-only Firebase Admin packages.
- Preserve Firebase Authentication + Firestore as the shared identity/data layer; do not add Supabase or another database.
- Authenticate Android requests using Firebase ID tokens, validate all inputs, and keep all privileged reads/writes on the server.
- No client may set balances, roles, age eligibility, or purchase verification results. Use Firestore transactions and idempotency for financial writes where the existing data model permits.
- Do not enable playback or invent catalogue content without configured licensed streams and rights.let th App and website be hosted here on lovavable 