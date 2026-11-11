# BQ SQWAD TV

BQ SQWAD TV is a pay-as-you-go streaming product by Bq Sqwad Technologies. The website source stays at the repository root; the native Kotlin Android application lives in `android/`.

## Canonical planning documents
- `docs/MASTER_TECHNICAL_SPEC.md` — approved product, database, permissions, licensing, PAYG, payout, security and hybrid streaming specification.
- `docs/IMPLEMENTATION_BLUEPRINT.md` — repository-mapped implementation sequence, current audit findings, target files/routes and external blockers.

## Layout
- `src/` — existing website source and shared API routes; keep website and Android code separate.
- `android/` — Jetpack Compose app, package `com.bqsqwad.tv`.
- `docs/API.md` — Android/server integration contract.
- `docs/BILLING.md` — server-authoritative wallet/session rules.
- `docs/SECRETS_CHECKLIST.md` — Lovable Cloud secrets and console steps.
- `docs/STREAMING.md` — licensed provider integration.
- `docs/PHASE_1_ARCHITECTURE.md` — original Phase 1 architecture baseline.

## Backend status
The repository contains server-side Firebase/Firestore helpers and API route files for profile completion, catalogue, channel detail, wallet/ledger, session heartbeat/end, integrity challenge and the restricted schema inspector. The session-start, payment, licensing, producer/organization, rights-holder, provider playback and payout capabilities remain to be implemented or verified. A route file or client contract is not proof of production deployment.

Firebase Authentication + Firestore remain the shared identity/data layer. Firestore region: `africa-south1`. Android never writes wallet balances or ledger entries. Review the canonical master specification and implementation blueprint before adding schema or API functionality.

## Android
Open `android/` in Android Studio and follow [android/SETUP.md](android/SETUP.md). Debug project can open before owner supplies `google-services.json`; release builds intentionally fail until the real Firebase file is added. Secrets stay in Lovable Cloud and signing environment variables.
