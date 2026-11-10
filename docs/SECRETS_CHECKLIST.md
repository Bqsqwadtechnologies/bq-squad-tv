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
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full JSON key for a Google Cloud service account linked to Play Console and granted the minimum purchase/order verification permissions |
| `GOOGLE_PLAY_PACKAGE_NAME` | Exact Android application package: `com.bqsqwad.tv` |

Android uses Google Play Billing for digital credit purchases. The app sends purchase tokens to the backend; the backend verifies purchases with Google Play before crediting the wallet. Android must not use Paystack for in-app digital credits.

## Shared backend / Firebase

| Variable | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full Firebase service-account JSON for server-side Firebase Admin operations |
| `ADMIN_EMAIL` | Owner/admin email address |
| `GOOGLE_WEB_CLIENT_ID` | OAuth Web client ID used by Google sign-in, if the backend needs to distribute it to Android at runtime |
| `FIREBASE_WEB_CONFIG_JSON` | Firebase web client configuration JSON, only if the website is configured to retrieve its public Firebase client config from the backend |

The Firebase Android SDK still requires the generated `google-services.json` file at `android/app/google-services.json`. That file contains client configuration and is not a private service-account key. It cannot be replaced by the Firebase Admin service-account JSON. Website Firebase client configuration is also public client configuration; keep access rules and authorization on the server.

## Not needed yet

- No streaming-provider API key or webhook secret: no stream provider has been selected.
- No email-provider key: email delivery provider has not been selected.
- No ad-network credentials: do not add these until an ad provider is selected.
- No separate Paystack webhook secret: validate the webhook signature using the Paystack secret key as documented by Paystack.

## Outside-code setup

1. Firebase Console: register the Android app with its exact package, add debug/release SHA-1 and SHA-256 fingerprints, enable the required sign-in methods, and download `google-services.json`.
2. Google Play Console: link the Google Cloud service account and grant only the permissions required for purchase verification. Create one-time consumable products; product IDs returned by the backend must match Play Console.
3. Paystack Dashboard: obtain both public and secret keys. Keep the secret key exclusively server-side.
4. Release signing: create and back up the Android release keystore; store signing values in CI secrets, never in Git.
5. Streaming: when a provider is selected, obtain the necessary distribution rights and provider credentials before enabling real channels. Until then, use permitted demo/test streams only.
