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

The application uses an internal daily delivery ceiling of **800 MB per account** (the older 1 GB/day reading with a 20% safety margin). Its monthly ceiling is the lower of three times measured stored data or 30 GB, also with a 20% safety margin. These are application limits, not a claim that provider caps are configured. Treat an exhausted or unknown allowance as unavailable and stop issuing new viewing grants. Do not assume a provider cap guarantees that no charge can ever occur; the adult billing owner must confirm current cap behaviour, reset time and propagation delay in the account console and monitor alerts. The source and check date are shown beside each allowance in the owner screen.

## 2. Video-processing account spending limit

1. The adult billing owner signs in to the existing Modal workspace.
2. Review the workspace plan, included compute credit, included network egress and actual usage.
3. Keep the application spend guard enabled. Its monthly estimated compute limit defaults to **$25** and can be changed only from the Zillionaire dashboard with an audited reason.
4. Set any provider-level workspace budget or alert supported by the current plan. The application guard is an extra control, not a replacement for provider billing limits.
5. Keep the existing Modal deployment manual until the adult billing owner has reviewed the estimate and approved the deployment.

Do not run load tests or raise concurrency to test the limit. The application tracks estimated compute and output bytes and pauses new work at the configured monthly threshold.

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

The Zillionaire dashboard is the only top-level control centre. Configure only `ZILLIONAIRE_EMAIL` as its owner identity. Do not guess secret names or create duplicate credentials.

## 5. Existing storage-account credentials

- Lovable destinations may use the existing per-prefix pair `<PREFIX>_URL` and `<PREFIX>_SERVICE_ROLE_KEY`, or bundles named `STORAGE_LOV_BUNDLE_01` through `STORAGE_LOV_BUNDLE_NN`.
- An `items` array may contain at most 25 destination entries per secret. For a shared project, use one object containing `url`, `serviceRoleKey` and a `buckets` array (up to 500 bucket names); each bucket receives a stable destination ID derived from its name. Never include the JSON value in Git, chat or logs.
- Keep the existing Backblaze per-prefix names: `<PREFIX>_KEY_ID`, `<PREFIX>_APP_KEY`, `<PREFIX>_BUCKET_ID` and `<PREFIX>_ENDPOINT`. The discovery process reads the bucket name from the provider using the stored credentials; it does not return the credentials.
- Use the protected Storage locations screen to discover and register destinations. Discovery and registration require a recent sign-in confirmation.
- Do not create a new storage account or paid service to work around a missing credential. Keep credentials server-side and never expose them to browser or Android clients.

## 6. Encrypted storage configuration backups (owner setup required)

- The source now includes an AES-GCM export worker, a weekly task-queue hook, eight-copy retention, and a step-up-protected preview/apply restore route.
- An adult account owner must generate a high-entropy `CONFIG_BACKUP_KEY` (at least 32 characters) and add it only in the hosting provider's server-side secret settings. Never share the value in chat or commit it.
- Register a dedicated destination with purpose **Backup files**, verify its connection and usage, and confirm it has sufficient free capacity.
- The backup worker runs only when the existing worker scheduler calls the maintenance schedule endpoint, the key is configured, and a healthy active backup destination exists. Confirm that the existing Modal scheduler invokes this endpoint weekly; do not assume a schedule exists until verified.
- Restore is intentionally scoped: it restores existing non-legacy destination settings, preserves each destination's current connection-setting reference, marks restored locations unverified and rebuilds the pool index. It does not overwrite playback bindings or delivery ledgers. Run fresh health and usage checks after restore.
- Test export and restore with a non-production copy before relying on the process for disaster recovery. The latest source changes have not yet passed CI or runtime tests.

## 7. Owner review checklist

- Review the free-allowance caps and alerts for all ten storage accounts.
- Review the video-processing spend limit and current usage.
- Confirm the Firestore TTL policy for `videoWorkerNonces.expiresAt`.
- Add only the exact missing secret names documented by the relevant batch.
- Paid egress is permanently disabled in application policy; there is no setting to turn it on. The application must refuse new grants before the safe free allowance is exhausted.

## 8. Required secret names referenced by this project

The checker reports names only. Add or verify each name in the hosting provider's server-side secrets/settings screen; never put values in Git or chat.

- `ZILLIONAIRE_EMAIL` — the owner's exact sign-in email; configure in the hosting project's server environment.
- `FIREBASE_SERVICE_ACCOUNT_JSON` — Firebase project settings → Service accounts → generate a private key, then store the JSON securely as a server-side secret.
- `PAYSTACK_SECRET_KEY` — Paystack Dashboard → Settings / API Keys & Webhooks; server-side only.
- `PAYSTACK_PUBLIC_KEY` — Paystack Dashboard → Settings / API Keys & Webhooks; use only where the client integration requires it.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — Google Play Console API access service account credentials; server-side only.
- `GOOGLE_PLAY_PACKAGE_NAME` — the Android application ID configured in the Play Console; this is a setting, not a credential.
- `VIDEO_WORKER_KEYS_JSON` — JSON map of worker IDs to independent random credentials (each at least 48 characters); add only to the server environment and the Modal worker secret.
- `CONFIG_BACKUP_KEY` — optional until an adult account owner configures and tests encrypted storage backups; server-side hosting secret only.
- `MODAL_WAKE_URL` — the deployed Modal secured wake endpoint URL; store as a server-side setting.
- `MODAL_WAKE_SECRET` — random secret of at least 32 characters shared by the API and Modal wake endpoint; secret-manager only.
- `VIDEO_WORKER_LEASE_MINUTES` — optional server setting for the worker lease (default 10, bounded 2–30 minutes).
- `STREAMING_URL_ENCRYPTION_KEYS_JSON` and `STREAMING_URL_ACTIVE_KEY_VERSION` — existing versioned server-side encryption key ring required only when encrypted HLS is enabled.

Only enable a feature after its required server-side setting is present and verified. The checker cannot inspect provider dashboards and does not establish that a credential is valid.


## 9. Modal worker setup and key rotation

1. Keep the existing Modal application name and existing worker deployment; do not create a second worker app or queue.
2. Add `VIDEO_WORKER_KEYS_JSON` to the server and Modal secret managers. Use one unique credential per worker ID; never paste credentials into Git or chat.
3. Set `MODAL_WAKE_SECRET` in the API and the existing Modal secret. Set `MODAL_WAKE_URL` to the deployed wake endpoint.
4. Rotate a worker by adding its replacement credential, deploying the new worker, verifying successful claims, then disabling the old worker ID in the Zillionaire dashboard.
5. Keep the legacy shared worker key only during the migration window. Remove `STREAMING_HMAC_SECRET` worker fallback after all worker IDs use individual credentials; the same secret may still be required by playback signing until that separate use is migrated.
6. Keep the monthly spend guard on. Confirm provider account limits with the billing owner before any production processing.

## 10. Legal policy publication

Before publishing the legal pages as final policies:

1. Have the company's legal reviewer approve the Privacy Notice, Terms of Service and Producer Terms.
2. Confirm the company's legal entity name, operating address and governing jurisdiction.
3. Confirm data categories, service-provider disclosures, retention periods, user rights/contact process and any cross-border processing language.
4. Confirm wallet, payment, cancellation/refund, content-rights, producer revenue and payout clauses against the actual product configuration.
5. Only then replace the publication-pending page notices and remove their noindex metadata.

The current website routes are placeholders that explicitly say publication is pending. They are not legal agreements and must not be represented as approved policies.


## 11. Storage Fabric — File 03

- For each Backblaze account, verify the provider's daily caps and email alerts. The application independently uses an 800 MB/day safe ceiling and a monthly ceiling based on the lower published reading; the application limit does not replace provider caps.
- Review the allowance source and last-checked date shown for each account group. Backblaze's current pricing describes free egress up to three times average monthly storage; the older help guidance describes 1 GB/day. The application uses the lower monthly interpretation and a 20% safety margin.
- Lovable project groups start with a conservative 9 GB monthly delivery budget (twice the 4.5 GB soft cap for one 5 GB bucket), shared across every bucket in that project. The daily budget defaults to one-thirtieth of the monthly budget.
- Set a verified shared storage cap for each project group before increasing it above the conservative default. Never treat each bucket in one project as an independent quota unless the provider confirms that arrangement.
- Keep the two legacy storage locations intact. They remain read-only fallbacks for older assets and must never be deleted, renamed or migrated as part of pool registration.
- Keep paid egress disabled. Do not add paid egress secrets, controls or automatic fallback to paid transfer.
- The application owner and adult billing owner should review account allowances and alerts before enabling production storage or playback.

## Direct playback storage CORS setup

Direct-signed playback sends HLS segments from the selected storage provider straight to the viewer's player. Configure browser CORS on every active HLS bucket before selecting **Direct signed storage links** for that location. Keep **Website delivery fallback** selected until the bucket's CORS test succeeds.

For each Backblaze B2 S3-compatible bucket, allow only the exact production website origins used by BQ SQWAD TV (including the https scheme; do not use * when credentials or private headers are involved). Allow methods `GET` and `HEAD`. Allow request headers `Range`, `If-Range`, and `Origin`. Expose response headers `Accept-Ranges`, `Content-Length`, `Content-Range`, `Content-Type`, `ETag`, and `Last-Modified`. Set a bounded preflight cache (for example, one hour). Do not enable public bucket access.

For every managed Lovable storage bucket used for HLS, apply the equivalent exact-origin CORS policy in the storage provider's bucket CORS settings: `GET` and `HEAD`, request headers `Range`, `If-Range`, `Origin`, and exposed headers `Accept-Ranges`, `Content-Length`, `Content-Range`, `Content-Type`, `ETag`, and `Last-Modified`. If the managed bucket interface does not expose a CORS setting or the browser test fails, leave that destination in `api_proxy` mode.

The player uses signed query-string URLs and does not require cross-origin cookies. Do not enable credentialed wildcard CORS. Test a real playlist and a byte-range segment from the production site before switching a destination to direct delivery. These CORS rules do not apply to the two protected legacy locations unless the owner independently confirms they are already configured; do not alter those locations as part of this work.

## 8. Money, wallet and playback security settings

Keep these values in the hosting provider's server-side environment settings only. Never share them in chat, source files, issue comments or logs.

- `FIREBASE_SERVICE_ACCOUNT_JSON`: existing Firebase server identity used by the application.
- `PAYSTACK_SECRET_KEY`: server-only Paystack transaction verification and webhook signature verification. `PAYSTACK_PUBLIC_KEY`: website checkout configuration; it is not a substitute for server verification.
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`: server-side Google Play purchase verification. `GOOGLE_PLAY_PACKAGE_NAME`: expected Android package identifier (`com.bqsqwad.tv`), not a credential.
- `STREAMING_HMAC_SECRET`: random signing secret for playback and session lease tokens. Keep playback signing disabled until this value is configured with at least 32 characters.
- `CONFIG_BACKUP_KEY`: encrypted storage configuration backups, as described above.
- `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`: only for the existing approved Modal worker deployment; do not deploy or increase spend as part of wallet work.

The owner-only secret health endpoint reports names and presence only; it never returns values. It is a diagnostic, not proof that a credential is valid or that the corresponding provider account is ready. Keep paid egress disabled and preserve both legacy storage locations.

The current security-header policy enforces transport, MIME, framing, referrer and browser-permission headers. Its CSP is in report-only mode while the website's script/style/asset requirements are audited; do not treat CSP enforcement as complete until a nonce/hash policy is verified against production rendering.
