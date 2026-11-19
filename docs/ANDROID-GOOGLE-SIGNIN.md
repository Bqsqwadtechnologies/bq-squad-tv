# Android Google Sign-In Setup Guide

This document explains how to configure Google Sign-In for the BQ SQWAD TV Android application and web client.

---

## 1. Application Package & Identity

- **Application ID / Package Name:** `com.bqsqwad.tv`
- **Supported Android API:** minSdk 24, targetSdk 36

---

## 2. Web Client ID Configuration

Google Sign-In on Android uses Google Identity Services / Credential Manager to obtain an ID token verified by the backend. The Android app requires the **OAuth 2.0 Web Application Client ID**, *not* an Android client ID.

### Where to Find the Web Client ID:
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your BQ SQWAD TV project.
3. Navigate to **Project Settings** (gear icon) > **General**.
4. In the **Web apps** section (or Google Cloud Console under **APIs & Services > Credentials**), locate the OAuth 2.0 Client ID of type **Web application**.
   - It usually looks like: `123456789012-abcdefghijklmnopqrstuvwxyz012345.apps.googleusercontent.com`
5. Set this value in:
   - Web server environment: `GOOGLE_WEB_CLIENT_ID`
   - Android build: `local.properties` or environment variable:
     ```properties
     GOOGLE_WEB_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
     ```

---

## 3. Keystore Fingerprints (SHA-1 & SHA-256)

For Google Sign-In and Play Integrity to authorize token issuance to `com.bqsqwad.tv`, the SHA-1 and SHA-256 certificate fingerprints for **BOTH** your debug and release keystores must be registered in the Firebase Android App.

### Why Both Are Required:
- **Debug Fingerprint:** Required for local development builds and developer emulator runs signed with `debug.keystore`. Without this, tapping "Continue with Google" returns error code 10 (`DEVELOPER_ERROR`).
- **Release Fingerprint:** Required for release APKs/AABs published to Google Play or distributed to production testers.
- **Play App Signing Fingerprint:** If using Google Play App Signing, also copy the SHA-1 and SHA-256 from the **Play Console > Release > Setup > App Integrity** into Firebase Console.

---

## 4. Extracting Fingerprints

### Method A: Gradle signingReport (Recommended)
Run the following from the `android` root directory:
```bash
cd android
./gradlew signingReport
```
This prints the MD5, SHA-1, and SHA-256 hashes for all build variants (`debug`, `release`).

### Method B: keytool command
For debug keystore:
```bash
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

For release keystore:
```bash
keytool -list -v -keystore /path/to/release.keystore -alias your-key-alias
```

---

## 5. Adding Fingerprints to Firebase Console
1. In Firebase Console, go to **Project Settings > General**.
2. Scroll to **Your apps** and select the Android app with package `com.bqsqwad.tv`.
3. Click **Add fingerprint**.
4. Paste the **SHA-1** fingerprint and save.
5. Click **Add fingerprint** again, paste the **SHA-256** fingerprint, and save.
6. Repeat for both debug and release keys.
7. Download the updated `google-services.json` and place it in `android/app/google-services.json`.

---

## 6. Build Time Behavior
If `GOOGLE_WEB_CLIENT_ID` is missing from `local.properties` and environment variables:
- The build will log a Gradle warning at compile time.
- The UI will keep the Google Sign-In button visible with an explicit setup notice rather than crashing or hiding silently.
