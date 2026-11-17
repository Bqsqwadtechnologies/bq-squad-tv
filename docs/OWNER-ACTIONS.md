# Owner Actions

This checklist contains account-console work that cannot safely be completed from source code. The account owner (and an adult billing owner/guardian where applicable) must perform provider-console and spending changes. Never send passwords, access keys, signing values or service-account files in chat or commit them to Git.

## 1. Backblaze storage accounts — repeat for all ten

For each of the ten existing storage accounts:

1. Sign in to the account.
2. Open **B2 Cloud Storage** and then **Caps & Alerts**.
3. Choose **Edit Caps**.
4. Review the **Storage**, **Download Bandwidth**, **Class B** and **Class C** daily dollar caps.
5. If the form supports a zero cap, use zero only after confirming in the provider interface what zero means. Otherwise choose the smallest supported non-zero limit.
6. Turn on email alerts.
7. Save the settings and confirm the displayed caps.

The project must treat an exhausted or unknown allowance as unavailable and stop issuing new viewing grants from that destination. Do not assume a cap setting guarantees that no charge can ever occur; confirm the provider's current cap behaviour and monitor alerts. The stated counter reset time and propagation delay must be verified in the account console before relying on them.

## 2. Video-processing account spending limit

1. Sign in to the existing video-processing account.
2. Open **Settings** and locate the spending or usage limit.
3. Have the billing owner set a conservative limit. The proposed example is **$5 above the applicable free credit**, only if the account supports that setting and the billing owner approves it.
4. Keep deployment manual through the repository's existing manual deployment workflow.
5. Confirm the current usage and limit in the provider console.

Do not run load tests or raise concurrency to test the limit. The application must track estimated usage and pause new work before the configured monthly budget threshold.

## 3. Firestore expiry policy

In the existing project console:

1. Open **Firestore Database**.
2. Open **TTL policies**.
3. Create a policy for collection group `videoWorkerNonces` using timestamp field `expiresAt`.
4. Add TTL policies for any additional short-lived collections only when a later batch documents their exact collection and expiry field.
5. Confirm the policy is enabled. TTL deletion is asynchronous; application security must not depend on immediate deletion.

## 4. Hosting secrets

When a batch identifies a required missing credential:

1. Open the hosting provider's project settings.
2. Open the environment/secrets settings for the correct deployment environment.
3. Add the exact secret name and source documented by that batch.
4. Save it in the provider console only; never paste its value into chat, source code, logs or Git.
5. Keep the related feature disabled until the required setting is present and verified.

The exact secret names and their authoritative provider-console locations will be added here by the implementation batches that introduce each dependency. Do not guess secret names or create duplicate credentials.

## 5. Existing storage-account credentials

Follow the credential bundle format and naming rules documented in **File 03** before adding or rotating any storage credentials. Do not create a new storage account or paid service to work around a missing credential. Keep credentials server-side and never expose them to browser or Android clients.

## 6. Owner review checklist

- Review the free-allowance caps and alerts for all ten storage accounts.
- Review the video-processing spend limit and current usage.
- Confirm the Firestore TTL policy for `videoWorkerNonces.expiresAt`.
- Add only the exact missing secret names documented by the relevant batch.
- Keep paid delivery, paid egress and optional fee-bearing integrations disabled unless the owner explicitly approves a separate change.

## 7. Required secret names referenced by this project

The checker reports names only. Add or verify each name in the hosting provider's server-side secrets/settings screen; never put values in Git or chat.

- `ZILLIONAIRE_EMAIL` — the owner's exact sign-in email; configure in the hosting project's server environment.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase project settings → Service accounts → generate a private key, then store the JSON securely as a server-side secret.
- `ADMIN_EMAIL` — the designated administrator email; configure in the hosting project's server environment.
- `PAYSTACK_SECRET_KEY` — Paystack Dashboard → Settings / API Keys & Webhooks; server-side only.
- `PAYSTACK_PUBLIC_KEY` — Paystack Dashboard → Settings / API Keys & Webhooks; use only where the client integration requires it.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Play Console API access service account credentials; server-side only.
- `GOOGLE_PLAY_PACKAGE_NAME` — the Android application ID configured in the Play Console; this is a setting, not a credential.

Only enable a feature after its required server-side setting is present and verified. The checker cannot inspect provider dashboards and does not establish that a credential is valid.


## 8. Legal policy publication

Before publishing the legal pages as final policies:

1. Have the company's legal reviewer approve the Privacy Notice, Terms of Service and Producer Terms.
2. Confirm the company's legal entity name, operating address and governing jurisdiction.
3. Confirm data categories, service-provider disclosures, retention periods, user rights/contact process and any cross-border processing language.
4. Confirm wallet, payment, cancellation/refund, content-rights, producer revenue and payout clauses against the actual product configuration.
5. Only then replace the publication-pending page notices and remove their noindex metadata.

The current website routes are placeholders that explicitly say publication is pending. They are not legal agreements and must not be represented as approved policies.
