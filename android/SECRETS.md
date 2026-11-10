# Android and backend configuration

## Lovable Cloud Secrets

Paste the provider-issued values into Lovable Cloud → Secrets:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — full Firebase Admin service-account JSON.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Play purchase-verification service-account JSON.
- `GOOGLE_PLAY_PACKAGE_NAME` — `com.bqsqwad.tv`.
- `ADMIN_EMAIL` — owner/admin email.
- `PAYSTACK_SECRET_KEY` — Paystack secret key, website payments only.
- `PAYSTACK_PUBLIC_KEY` — Paystack public key; backend returns it to the website at runtime.
- `GOOGLE_WEB_CLIENT_ID` — optional OAuth client ID if delivered through the backend.
- `FIREBASE_WEB_CONFIG_JSON` — optional Firebase web client config if delivered through the backend.

Do not add streaming-provider, email-provider, or ad-network credentials yet. No streaming provider has been selected. There is no separate Paystack webhook secret requirement: webhook signature verification uses Paystack's documented signature scheme and secret key.

## Firebase client files

- The Android Firebase SDK requires the generated `android/app/google-services.json` file.
- This is client configuration, not a Firebase Admin service-account key.
- The website's Firebase client config is also public client configuration. Secure data with Firebase rules and server authorization, not by pretending client config is secret.

## Local non-secret Android configuration

- `API_BASE_URL` and `PRODUCER_CONSOLE_URL` are runtime/build configuration values, not private credentials.
- Do not put Paystack secret keys, Firebase service-account JSON, or Google Play service-account JSON in Android.
- Release signing uses CI environment variables only.

See [../docs/SECRETS_CHECKLIST.md](../docs/SECRETS_CHECKLIST.md) for sourcing and setup.
