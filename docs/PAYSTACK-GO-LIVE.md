# Paystack Go-Live Guide for BQ SQWAD TV

This document explains how the platform owner switches from Paystack test mode to live production mode.

## 1. Required Secrets
Configure the following secrets in the hosting environment (never commit real values to Git):
- `PAYSTACK_SECRET_KEY`: Your live secret key starting with `sk_live_...`
- `PAYSTACK_PUBLIC_KEY`: Your live public key starting with `pk_live_...`

## 2. Webhook Configuration in Paystack Dashboard
1. Log in to the [Paystack Dashboard](https://dashboard.paystack.com/).
2. Navigate to **Settings** → **API Keys & Webhooks**.
3. Set your **Live Webhook URL** to:
   ```
   https://tv.bqsqwad.com/api/public/v1/payments/paystack/webhook
   ```
4. Ensure the following events are enabled:
   - `charge.success`
   - `transfer.success` / `transfer.failed` (for payouts)

## 3. Production Verification
1. Initiate a small real transaction (e.g. ₦100 or ₦200 top-up) in the viewer wallet.
2. Verify that the Paystack checkout completes and returns you to the app.
3. Confirm that the wallet balance reflects the credited minor units immediately without requiring a full page reload.
4. Verify that an idempotent receipt record is created.

## 4. Rollback Plan
If issues arise in production, immediately replace `PAYSTACK_SECRET_KEY` and `PAYSTACK_PUBLIC_KEY` with your test keys (`sk_test_...` and `pk_test_...`). The application will gracefully resume test-mode billing operations.
