# Android setup

## Requirements
Android Studio, Android SDK 36, JDK 17 and Gradle 8.13. Firebase project `bq-sqwad-tv` must remain on Spark. A deployed Lovable Cloud API implementing [../docs/API.md](../docs/API.md) is required for production.

## Local configuration
Create `android/local.properties` (never commit):

```properties
sdk.dir=/absolute/path/to/Android/Sdk
API_BASE_URL=https://bqsqwad.com/api/public
GOOGLE_WEB_CLIENT_ID=YOUR_FIREBASE_WEB_OAUTH_CLIENT_ID
PRODUCER_CONSOLE_URL=https://YOUR-WEBSITE/producer
```

The base URL must include the `/api/public` prefix because the shared routes are hosted under `/api/public/v1/...`; Android appends the `v1/...` paths. For this deployment use `https://bqsqwad.com/api/public`, not just the bare domain. `GOOGLE_WEB_CLIENT_ID` is a public OAuth client ID (not a client secret). Setting `web_client_id` in Lovable Cloud Secrets configures the website only; Android Studio must also receive the same public client ID through this local property or the `GOOGLE_WEB_CLIENT_ID` build environment variable. Do not put private API keys or service-account JSON here.

Add the real Firebase config at `android/app/google-services.json`. Debug project can open before this file is supplied because Firebase initializes from public project identifiers. Release tasks fail with a clear message until the real file is present. Register the exact package `com.bqsqwad.tv` in Firebase for both debug and release.

## Firebase console
1. Add SHA-1 and SHA-256 fingerprints for debug and release signing certificates.
2. Enable Google and Email/Password sign-in.
3. Add Android app package `com.bqsqwad.tv`, then download `google-services.json`.
4. Obtain Web OAuth client ID from Firebase Authentication / Google provider and set `GOOGLE_WEB_CLIENT_ID`.
5. Enable Firestore, FCM, Analytics and Crashlytics. No Cloud Functions or Firebase Storage.

## Google Play
Create one-time consumable products matching IDs returned by `GET v1/wallet/google-play/products`. Link Play service account for server verification. Sign release AAB with a secure keystore; CI variables: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Never commit signing materials.

## Run
Open `android/` in Android Studio, sync Gradle and run. Without deployed edge endpoints, profile completion, catalog, playback and wallet flows fail closed with configuration errors.


## Firebase App Check

The Android application installs the Firebase App Check Play Integrity provider at startup and attaches App Check tokens to backend API requests. No App Check secret belongs in the APK.

Before enabling server enforcement:

1. Register the Android app `com.bqsqwad.tv` in Firebase App Check.
2. Enable the Play Integrity provider for that registered Android app.
3. Confirm the app's signing certificate fingerprints are configured in Firebase/Play Console.
4. Install and test a signed build from the expected distribution track.
5. Keep the Lovable server secret `APP_CHECK_ENFORCED` set to `false` until the website reCAPTCHA Enterprise provider is also configured and both clients have been tested.

The website requires a Firebase Web App ID and reCAPTCHA Enterprise site key. These are public identifiers, not private service-account credentials. The backend service account must have the Firebase App Check Token Verifier role before enforcement is enabled.
