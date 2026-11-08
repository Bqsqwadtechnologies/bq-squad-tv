# Lovable Cloud secrets checklist

Paste secrets into Lovable Cloud server-side Secrets. Do not add values to GitHub, Android BuildConfig, local.properties or browser bundles.

| Variable | Value / where to obtain it | Feature that fails without it |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Secret key in Paystack Dashboard → API Keys & Webhooks. Web only. | Web wallet top-up initialization and verification. |
| `PAYSTACK_WEBHOOK_SECRET` | Signing secret configured for Paystack webhook. | Authenticating payment callbacks before crediting web wallet. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full JSON for a least-privilege Firebase service account from Firebase project settings / service accounts. | Firebase Admin wallet transactions, profile/age enforcement, custom claims, roles and FCM administration. |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Full JSON key for a Google Cloud service account linked to Play Console with purchase/order verification permissions. | Android purchase-token verification. |
| `ADMIN_EMAIL` | Exact owner email address. | Initial Owner role assignment. |
| `GOOGLE_PLAY_PACKAGE_NAME` | Exact value `com.bqsqwad.tv`. | Matching Google Play purchases to the Android package. |
| `STREAM_PROVIDER_API_KEY` | Selected licensed stream/ingest provider API key, only if required by that provider. | Provider ingest, signed playback, health and replay recording. |
| `STREAM_PROVIDER_WEBHOOK_SECRET` | Provider webhook signing secret, if provider callbacks are used. | Authenticating stream/recording callbacks. |
| `EMAIL_PROVIDER_API_KEY` | Transactional email provider API key, if configured. | Verification, receipts and email notifications. |
| `EMAIL_FROM_ADDRESS` | Verified sender address/domain. | Delivering account and payment emails. |
| `AD_NETWORK_APP_ID` | Third-party ad network app/site identifier, only if one is integrated. | Third-party ad inventory; internal platform ads do not need it. |
| `AD_NETWORK_SECRET_KEY` | Third-party ad network server key, only if its API requires it. | Third-party ad serving/reporting. |
| `PAYSTACK_PUBLIC_KEY` | Public Paystack key from Dashboard; web configuration, not a secret. | Web checkout UI only. Never use in Android. |

## Non-secret configuration
`GOOGLE_PLAY_PACKAGE_NAME=com.bqsqwad.tv` is an identifier, not a credential. Firebase project ID is `bq-sqwad-tv`. Android `API_BASE_URL`, OAuth Web client ID and Producer Console URL are local configuration. No third-party stream, email or ad provider is currently selected in this repository; only add optional variables when a provider is actually configured.

## Outside-code console checklist
1. Firebase: register Android package; add debug and release SHA-1/SHA-256 fingerprints; enable Google and Email/Password sign-in; download `google-services.json`.
2. Play Console: link service account, grant purchase verification access, create one-time consumable products. Product IDs must match those returned by the backend.
3. Signing: create and back up release keystore; configure CI environment variables; never commit it.
4. Streaming: obtain written territorial rights for every league/movie/channel; record rights holder and licence expiry.
5. Publish Terms, Privacy, Refund and Adult Content policies; configure verified domain and email sender.
