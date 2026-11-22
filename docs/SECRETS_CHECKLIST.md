> **Canonical specification:** [MASTER_TECHNICAL_SPEC.md](MASTER_TECHNICAL_SPEC.md) defines the security requirements. This checklist describes secret names only; never commit secret values.

# Lovable Cloud secrets checklist

Store backend credentials and public payment configuration in Lovable Cloud → Secrets. Never commit secret values to GitHub or put private credentials in Android resources, BuildConfig, local.properties, or browser bundles.

## Website payments — Paystack

| Variable | Value |
|---|---|
| `PAYSTACK_SECRET_KEY` | Paystack Dashboard → API Keys & Webhooks → Secret Key |
| `PAYSTACK_PUBLIC_KEY` | Paystack Dashboard → API Keys & Webhooks → Public Key |

The website must request the public key from a server configuration endpoint at runtime. The secret key must only be used by server-side payment initialization/verification. Verify webhook signatures with Paystack's documented signature scheme using the Paystack secret key; do not create an invented third webhook credential.

## Android payments — Google Play Billing

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` (shared) | The same service-account JSON used by Firebase Admin; its service-account email must also be linked to Play Console and granted the minimum purchase/order verification permissions |
| `GOOGLE_PLAY_PACKAGE_NAME` | Exact Android application package: `com.bqsqwad.tv` |

Android uses Google Play Billing for digital credit purchases. The app sends purchase tokens to the backend; the backend verifies purchases with Google Play before crediting the wallet. Android must not use Paystack for in-app digital credits.

## Transactional email — Brevo

| Variable | Value |
|---|---|
| `BREVO_API_KEY` | Brevo dashboard → Settings → SMTP & API → API Keys & MCP; server-only API key |
| `BREVO_SENDER_EMAIL` | Optional email address shown as the sender of verification emails; defaults in code to `tv@bqsqwad.com` and must be verified in Brevo. This is separate from `ZILLIONAIRE_EMAIL`. |
| `BREVO_SENDER_NAME` | Optional display name; defaults to `BQ SQWAD TV` |

The API key must never be exposed to browser or Android clients. The backend generates, hashes, expires, rate-limits and consumes six-digit email-verification codes. The current password-recovery UI still uses Firebase password-reset email links.

## Shared backend / Firebase

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service-account JSON used for Firebase Admin and, when separately configured, Google Play verification. The backend mints separate OAuth tokens with the required API scopes. |
| `ZILLIONAIRE_EMAIL` | Exact verified Firebase Authentication email address reserved for the platform owner and protected Zillionaire authority. This secret contains the email address, not an email-service API key. The backend compares it case-insensitively and requires Firebase email verification. |
| `ADMIN_EMAIL` | Legacy compatibility only; `ZILLIONAIRE_EMAIL` takes precedence. Remove this old secret after confirming the new one is configured and tested. |
| `GOOGLE_WEB_CLIENT_ID` or `web_client_id` | Public OAuth Web client ID used by Google sign-in. The website config endpoint accepts either environment name; Android also needs it in local.properties or the build environment. |
| `FIREBASE_WEB_APP_ID` or `firebase_web_app_id` | Public Firebase Web App ID from the web app registered in this same Firebase project; required for website App Check token exchange. |
| `RECAPTCHA_ENTERPRISE_SITE_KEY` or `recaptcha_enterprise_site_key` | Public reCAPTCHA Enterprise site key configured for website Firebase App Check. |
| `APP_CHECK_ENFORCED` | Keep `false` during setup. Set to `true` only after Android Play Integrity and website reCAPTCHA Enterprise App Check have been enabled and live-tested. |
| `FIREBASE_WEB_CONFIG_JSON` | Firebase web client configuration JSON, only if the website is configured to retrieve its public Firebase client config from the backend |

For push delivery, enable the Firebase Cloud Messaging API in the same Google Cloud project and ensure the existing service account has permission to send FCM v1 messages. The backend requests the `firebase.messaging` OAuth scope from that same service account; no additional private key or new secret is required.

The Firebase Android SDK still requires the generated `google-services.json` file at `android/app/google-services.json`. That file contains client configuration and is not a private service-account key. It cannot be replaced by the Firebase Admin service-account JSON. Website Firebase client configuration is also public client configuration; keep access rules and authorization on the server.

## Not needed yet

- No streaming-provider API key or webhook secret: no stream provider has been selected.
- Brevo is the current transactional email provider; configure `BREVO_API_KEY` and verify the sender address before production OTP delivery.
- No ad-network credentials: do not add these until an ad provider is selected.
- No separate Paystack webhook secret: validate the webhook signature using the Paystack secret key as documented by Paystack.

## Outside-code setup

1. Firebase Console: register the Android app with its exact package, add debug/release SHA-1 and SHA-256 fingerprints, enable the required sign-in methods, and download `google-services.json`.
2. Google Play Console: link the Google Cloud service account and grant only the permissions required for purchase verification. Create one-time consumable products; product IDs returned by the backend must match Play Console.
3. Paystack Dashboard: obtain both public and secret keys. Keep the secret key exclusively server-side.
4. Release signing: create and back up the Android release keystore; store signing values in CI secrets, never in Git.
5. Streaming: when a provider is selected, obtain the necessary distribution rights and provider credentials before enabling real channels. Until then, use permitted demo/test streams only.


## Streaming source encryption

Configure these values in Lovable Cloud → Secrets before enabling producer source-URL submission:

| Variable | Value |
|---|---|
| `STREAMING_URL_ENCRYPTION_KEYS_JSON` | JSON object mapping key versions (for example `v1`) to base64url-encoded, cryptographically random 32-byte AES-256 keys |
| `STREAMING_URL_ACTIVE_KEY_VERSION` | The version identifier used for new source URL encryption |

Keep old key versions available during rotation until all encrypted records have been re-encrypted or intentionally retired. Generate keys with a cryptographically secure random generator, store them only in Lovable Cloud Secrets, restrict who can reveal/manage them, and test recovery before production. Never paste key values into GitHub, source code, Android resources, browser configuration, tickets or logs.

Provider-specific API credentials and webhook signing keys are added only after a provider has been selected and its contract/security requirements reviewed. Use server-only secret names agreed during provider onboarding; do not expose them to clients.


### Firebase App Check rollout

- Android source initializes the Play Integrity App Check provider and attaches App Check tokens to API requests.
- Website source exchanges reCAPTCHA Enterprise tokens for Firebase App Check tokens and attaches them to API requests.
- The server verifies `X-Firebase-AppCheck` tokens when `APP_CHECK_ENFORCED=true`.
- Before enabling enforcement, register the Android app and website in Firebase App Check, configure Play Integrity and reCAPTCHA Enterprise, authorize the website domains, and confirm the service account has the Firebase App Check Token Verifier permission.
- The server enforcement switch intentionally defaults to off until both clients are configured; do not enable it prematurely or sign-in/playback/payment API requests will be rejected.


## Storage federation (server-side only)

Storage credentials use the secret prefix registered for each storage destination. The application stores routing metadata only; it never stores secret values in the database or client applications.

- Lovable Storage destination prefix: `<PREFIX>_URL` and `<PREFIX>_SERVICE_ROLE_KEY`.
- Backblaze B2 destination prefix: `<PREFIX>_KEY_ID`, `<PREFIX>_APP_KEY`, `<PREFIX>_BUCKET_ID` and `<PREFIX>_ENDPOINT`.

Obtain these values from the relevant storage account's developer/API settings. Add them only in the server hosting environment's secret manager. Do not add secret values to the destination form, source control, Android build settings or public client configuration.

For the storage federation rollout, the registry accepts these B2 secret-prefix groups (add values only for buckets/accounts that actually exist and have been verified):
- Prompt 2 naming: `STORAGE_B2_01` through `STORAGE_B2_11`, each with `_KEY_ID`, `_APP_KEY`, `_BUCKET_ID`, and `_ENDPOINT`.
- Earlier inventory compatibility: `STORAGE_B2_NN01` through `STORAGE_B2_NN10`, with the same four suffixes.
- Additional Lovable project prefixes, only if provisioned: `STORAGE_LOV_01` through `STORAGE_LOV_05`, each with `_URL` and `_SERVICE_ROLE_KEY`.

Do not create duplicate secret groups just to satisfy both naming conventions. Register each real destination with the matching prefix. For multiple Lovable buckets in one workspace, use one shared quota group until the workspace's actual quota model is verified. Never paste secret values into chat or GitHub.

Further worker and storage-provider secret names will be appended after the remaining batch specifications are received and their exact requirements are confirmed.
