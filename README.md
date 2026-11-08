# BQ SQWAD TV

BQ SQWAD TV is a pay-as-you-go streaming product by Bq sqwad technologies. The website source stays at the repository root; the native Kotlin Android application lives in `android/`.

## Layout
- `src/` — existing website source; keep website and Android code separate.
- `android/` — Jetpack Compose app, package `com.bqsqwad.tv`.
- `docs/API.md` — Android/server integration contract.
- `docs/BILLING.md` — server-authoritative wallet/session rules.
- `docs/SECRETS_CHECKLIST.md` — Lovable Cloud secrets and console steps.
- `docs/STREAMING.md` — licensed provider integration.

## Backend status
The current Git tree contains a website starter shell but no Lovable Cloud edge-function source, Firestore rules or prior API/billing contract. Android is wired to the contract in `docs/API.md`; those server routes must be implemented and deployed before production profile, catalog, playback, wallet, ad and producer features can operate. Android never writes wallet balances or ledger entries.

## Android
Open `android/` in Android Studio and follow [android/SETUP.md](android/SETUP.md). Debug project can open before owner supplies `google-services.json`; release builds intentionally fail until the real Firebase file is added. Secrets stay in Lovable Cloud and signing environment variables.
