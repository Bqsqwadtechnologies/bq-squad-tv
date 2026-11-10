# BQ SQWAD TV — Phase 1 architecture

## Scope

Phase 1 establishes the shared product foundation for the website and Android application. It does not claim production backend routes, real broadcast distribution, payment settlement, or provider integrations are live until those services are implemented, configured and tested.

## System topology

Website (TanStack Start / React)
- Public discovery and launch pages
- Sign-in, profile and account UI
- Channel catalogue and web player shell
- Paystack website checkout

Shared application API (Lovable Cloud server functions)
- Firebase Admin authentication and authorization
- Profile and age-policy enforcement
- Catalogue, channel rights and schedules
- Playback sessions and signed stream URL issuance
- Wallet ledger and atomic session settlement
- Paystack initialize, verify and webhook
- Google Play purchase verification
- Producer/admin authorization and audit events

Android (Kotlin / Jetpack Compose)
- Sign-in and profile setup
- Catalogue, search and channel details
- Media3 HLS/DASH playback
- Heartbeat-based server-metered sessions
- Wallet UI and Google Play Billing
- Producer summary UI

Firebase Authentication + Firestore is the shared identity/data layer.

## Trust boundaries

- The backend is the sole authority for balances, ledger entries, session duration, rates, refunds, purchase verification, roles, producer earnings and revenue splits.
- Clients may display server responses and non-authoritative estimates; they must never write financial or authorization records.
- Firebase Admin credentials, Paystack secret credentials and the future Google Play service-account JSON stay in Lovable Cloud Secrets.
- Firebase client configuration is not an Admin credential. Android uses android/app/google-services.json; browser Firebase configuration, if needed, is public client configuration protected by backend authorization and Firestore rules.
- Playback URLs are short-lived and issued only after server-side authentication, age, territory, rights, wallet and concurrency checks.
- Never ship provider ingest keys, DRM secrets, service-account JSON or payment secret keys in the website bundle or APK.

## Phase 1 delivery slices

### 1. Repository and UI foundation
- Keep website source at repository root and Android source under android/.
- Keep the website responsive and the Android app native.
- Establish branded metadata, navigation, loading, empty and error states.
- Keep the website and Android app pointed at the same documented API contract.

### 2. Identity and profile
- Firebase Authentication is the identity provider.
- Backend verifies Firebase ID tokens on protected endpoints.
- Server calculates age eligibility from the profile date of birth; client-supplied age is never trusted.
- Under-18 accounts must not receive adult catalogue metadata, ad targeting or playback authorization.

### 3. Catalogue and playback
- Catalogue endpoints return only content permitted for the user's account and territory.
- A playback session is created server-side; the response contains a signed, expiring HLS/DASH URL.
- Android uses Media3; the website player must use the same server-issued playback session contract.
- No real channels are enabled until a distribution provider, valid streams and territory rights are supplied. Use provider-authorized demo/test media only.

### 4. Wallet and payments
- Website digital wallet checkout uses Paystack.
- Android digital wallet top-ups use Google Play Billing.
- Each provider is verified on the backend before any credit is applied.
- Purchase tokens, webhook events and session settlement are idempotent.
- The missing Google Play service-account credential is a deployment dependency, not a reason to invent a key or expose credentials.

### 5. Producer and administration
- Producer and admin roles are assigned and checked server-side.
- Client screens are presentation only until the corresponding authorized backend routes exist.
- Revenue splits are versioned and snapshotted when a session settles.

## Current repository baseline and known gaps

- The repository contains a TanStack Start website shell and a Kotlin/Compose Android app.
- Android already has sign-in/profile screens, catalogue screens, a Media3 player foundation, wallet and producer UI, plus an API contract in docs/API.md.
- docs/API.md describes required endpoints; it is not proof those endpoints are deployed.
- At this audit point, no backend function source, Firestore security rules, or deployed API implementation was found in the repository. Do not mark authentication, catalogue, playback, wallet or payment as production-ready until implementation and integration tests prove them.
- Android release configuration requires the real Firebase Android client file. Debug UI can be worked on without service-account credentials.
- Google Play purchase verification remains pending until its separate service-account credential is configured.
- A streaming provider and content rights are still required before real channel playback can be enabled.

## Phase 1 acceptance criteria

1. Website and Android builds compile from the repository without replacing or stubbing large source files.
2. Website and Android remain separate clients with one shared API contract.
3. Protected API routes verify Firebase ID tokens and enforce roles and age policy server-side.
4. Wallet and session settlement are server-authoritative, atomic and idempotent.
5. Paystack and Google Play flows cannot credit a wallet until backend verification succeeds.
6. No private credential is present in Git history, browser output or APK resources.
7. Playback only accepts short-lived server-issued URLs for authorized content.
8. Missing external credentials or licensed media produce clear disabled/configuration states, not fabricated success.
