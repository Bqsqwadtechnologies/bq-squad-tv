# Android and backend secrets

Never commit secret values. Paste backend secrets into Lovable Cloud server secrets only. Android uses the public API base URL and public Firebase identifiers.

## Lovable Cloud
Required server variables for the requested features:
- `PAYSTACK_SECRET_KEY` and `PAYSTACK_WEBHOOK_SECRET` — web top-ups only.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase Admin, server wallet writes and custom claims.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Play purchase verification.
- `ADMIN_EMAIL` — Owner account.
- `GOOGLE_PLAY_PACKAGE_NAME=com.bqsqwad.tv` — Android package identifier.
- `STREAM_PROVIDER_API_KEY`, `STREAM_PROVIDER_WEBHOOK_SECRET`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM_ADDRESS`, `AD_NETWORK_APP_ID`, `AD_NETWORK_SECRET_KEY` — optional, only when the corresponding provider is selected.

Exact descriptions and sourcing: [../docs/SECRETS_CHECKLIST.md](../docs/SECRETS_CHECKLIST.md).

## Local non-secret configuration
- `API_BASE_URL`, `GOOGLE_WEB_CLIENT_ID`, `PRODUCER_CONSOLE_URL` in `android/local.properties`.
- Owner supplies `android/app/google-services.json`; it is ignored by Git.
- Release signing uses CI environment variables only.
