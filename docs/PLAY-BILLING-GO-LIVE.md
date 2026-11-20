# Google Play Billing Go-Live Guide for BQ SQWAD TV

This document guides the owner in configuring in-app products and server credentials for digital credits on Android.

## 1. Google Cloud Service Account
1. In the Google Cloud Console, create a service account with the **Google Play Developer** role.
2. Generate and download a JSON key file.
3. Configure the secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` with the raw content of this JSON file.
4. Set `GOOGLE_PLAY_PACKAGE_NAME` to `com.bqsqwad.tv`.

## 2. Play Console In-App Products
In the [Google Play Console](https://play.google.com/console):
1. Select your app: **BQ SQWAD TV (`com.bqsqwad.tv`)**.
2. Go to **Monetize** → **In-app products**.
3. Create managed products matching your pricing packages, for example:
   - `bq_credits_tier_1`: ₦500 equivalent credits
   - `bq_credits_tier_2`: ₦1,000 equivalent credits
   - `bq_credits_tier_3`: ₦2,500 equivalent credits
4. Set status to **Active**.

## 3. Testing with Licence Testers
1. Add developer and tester email addresses to **Setup** → **License testing**.
2. Verify that purchases complete successfully in internal or closed testing tracks.
3. The server endpoint `/api/public/v1/wallet/google-play/verify` will consume the purchase token, verify binding to the authenticated Firebase user, and credit wallet minor units transactionally.
