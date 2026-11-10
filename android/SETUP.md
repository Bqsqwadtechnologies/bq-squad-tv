# Android setup

## Requirements
Android Studio, Android SDK 36, JDK 17 and Gradle 8.13. Firebase project `bq-sqwad-tv` must remain on Spark. A deployed Lovable Cloud API implementing [../docs/API.md](../docs/API.md) is required for production.

## Local configuration
Create `android/local.properties` (never commit):

```properties
sdk.dir=/absolute/path/to/Android/Sdk
API_BASE_URL=https://YOUR-LOVABLE-CLOUD-ENDPOINT
GOOGLE_WEB_CLIENT_ID=YOUR_FIREBASE_WEB_OAUTH_CLIENT_ID
PRODUCER_CONSOLE_URL=https://YOUR-WEBSITE/producer
```

The base URL is the API root; Android appends documented `v1/...` paths. Do not put secret keys here.

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
