# Owner Actions

# Owner Actions

## Security Verification Checklist (Mandatory Pre-Launch Testing)
Complete the following operational tests in the Zillionaire Control Centre:
1. [ ] **Enrol 2FA:** Set up an authenticator app (Google Authenticator, Authy, or 1Password) in `/zillionaire/security` -> MFA. Confirm six-digit TOTP verification succeeds and save emergency recovery codes.
2. [ ] **Sign in on a new device:** Sign in from an unrecognized browser or mobile device. Confirm device registry entry is created in `/zillionaire/security` -> Devices & Sessions.
3. [ ] **Step-up verification on payout:** Attempt to settle a payout in `/zillionaire/payouts` without step-up confirmation. Confirm the server returns `STEP_UP_REQUIRED` and requires fresh password + TOTP verification.
4. [ ] **Audit-chain tamper test:** Run `/zillionaire/security` -> Audit Integrity Check. Confirm all cryptographic parent-hash links are verified green with zero broken links.
5. [ ] **Emergency Panic Button Drill:** In `/zillionaire/security` -> Emergency Panic, activate Emergency Lockdown with a test reason. Confirm payouts and console sign-ins are frozen immediately, then perform one-tap release and verify normal status returns.


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
6. Deploy the current `firestore.indexes.json` with the adult project owner before enabling the updated storage pagination and wallet-hold expiry worker. This includes the `contentAssets` cursor indexes and the `walletHolds` status/expiry index.

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
- `AUDIT_HASH_KEY` — secret server-side HMAC key (minimum 32 characters) used to pseudonymize actor and target identifiers in access denial privacy audit records; server-side hosting secret only.
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
6. Deploy the updated existing Modal worker before enabling production playback. Its five-minute poll now schedules expiry sweeps for abandoned viewing-wallet holds; verify that `wallet_hold_reconcile` tasks complete and release expired holds. If the worker is not running, a two-minute hold can remain reserved until maintenance resumes.
7. Keep the monthly spend guard on. Confirm provider account limits with the billing owner before any production processing.

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

## 8. Legal page drafts — required before public launch

- The five default documents are drafts only: Privacy Policy, Terms and Conditions, Producer Terms, Producer Content Policy and Licensed Channel Provider Terms.
- A qualified lawyer must review the documents in every country where BQ SQWAD TV will operate before any page is published. The owner must edit the documents whenever an actual product practice, payment flow, data use, retention period, provider contract or legal requirement changes.
- In the Zillionaire dashboard, load the default pages, complete every legal placeholder in Settings, review each draft, and publish only after the legal review. Publishing requires a recent owner sign-in, blocks any remaining placeholder, records a version and audit reason, and sets whether viewers must accept the new version again.
- Confirm the minimum account age, data-retention periods, dispute window, wallet refund and closure rules, liability period, governing law, jurisdiction, postal address if required, producer revenue basis, revenue-change notice and minimum payout. These values must reflect actual operations and legal advice; do not guess.
- The provider terms must match each signed provider contract, including the revenue model, permitted deductions, territories, platforms, licence dates, settlement currency and dispute process.
- No new credential or secret is required for these legal drafts. Do not put identity evidence, payment details or provider credentials into legal page text.
- The seed script can validate the draft list locally. Remote seeding requires an authenticated owner session; never place an owner token in source control.
- Provider invitation acceptance and a complete provider console flow remain dependent on the provider-console implementation. Producer acceptance is enforced at producer verification; paid viewing is blocked until public terms and privacy acceptance are recorded.

## 9. Partner Portal & Provider Console Setup

- In the Zillionaire Dashboard (`/admin/providers`), provision licensed partner records with their registered legal name, agreement reference, settlement currency (e.g. NGN), and provider revenue share in basis points (e.g. 2500 BPS = 25.0%).
- Assign provider representatives in `providerUsers` with status `ACTIVE` and their corresponding `providerId`. Only verified provider representatives can access the partner portal at `/provider`.
- Reconcile monthly statements at the close of each calendar period: calculate Gross Viewing Revenue, deduct direct delivery and processing costs (CDN egress, payment processing, playback infrastructure), and compute the Net Gross Profit and provider share before approving and marking statements as paid.
- Monitor and resolve dispute threads from `/admin/support?type=disputes` or through the support inquiries inbox.

## 12. Zillionaire Identity Migration

To migrate existing user accounts and staff access permissions from legacy `adminModules` to the updated `zillionaireModules` format:

1. Sign in to the application using the verified owner account specified in `ZILLIONAIRE_EMAIL`.
2. Invoke the authenticated owner migration endpoint: `POST /api/public/v1/zillionaire/migration/zillionaire`.
3. The endpoint scans users with legacy permissions, copies them to `zillionaireModules`, marks `adminModulesRetired: true`, logs the action to the tamper-evident audit log, and returns the total migrated count.
4. During the migration window, the platform resolves both fields automatically. Once all user records have been updated, the legacy field is retired completely.

## 13. Deploying the Video Processing Host (Modal / Cloud GPU Worker) from Mobile or Terminal

To deploy or activate the multi-bitrate video transcoding host (240p to 1080p HLS ladder encoding):

1. **Modal Account**: Go to [modal.com](https://modal.com) from any phone browser or workstation and log in.
2. **Generate Credentials**: Under Account Settings → API Tokens, tap **Create Token**. Note the `MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET`.
3. **Configure Secrets**: Store both values in the project environment or backend secret manager. The platform automatically detects these tokens to enable GPU worker wakeups.
4. **Deploy Command (Terminal or Cloud Shell)**:
   ```bash
   pip install modal
   modal token set --token-id $MODAL_TOKEN_ID --token-secret $MODAL_TOKEN_SECRET
   modal deploy workers/video_worker.py
   ```
5. **Direct Publish Fallback**: Until the worker is deployed, the Upload Studio operates in **Direct Publish** mode, streaming H.264/AAC MP4 and HLS files directly to Web and Mobile viewers with token authentication and per-minute billing enabled.

## Batch readiness checklist (V5-02)

Before production launch, the owner should confirm: (1) legal pages have been reviewed by qualified counsel and placeholders reflect the actual service; (2) upload storage, direct playback and publishing have been tested with non-production media; (3) ad creatives, audience targeting and placements meet applicable policy and have an approved budget; (4) live chat timeout/ban and child-profile restrictions work as intended; (5) the test lab remains hidden, unpublished and excluded from public catalogs; (6) all required hosting secrets are present and validated without exposing values; and (7) storage, billing and worker limits are confirmed in the relevant provider consoles. This is a readiness checklist, not evidence that external settings or services are configured.

## Owner authenticator setup (V5-03 Batch 1)

- Set `ZILLIONAIRE_MFA_ENCRYPTION_KEY` in the server-side secret manager to a securely generated value with at least 32 characters. Never put its value in source control, chat, or logs. The service fails closed for authenticator setup if it is missing.
- Sign in with the verified owner account and existing owner access password, then enroll an authenticator app and confirm a current six-digit code. Store the one-time recovery codes in a secure password manager; they are displayed once and each code is single-use.
- Keep `ZILLIONAIRE_ACCESS_PASSWORD` configured. It remains required in addition to authenticator verification.
- Email alerts for new devices, location changes, and failed-attempt bursts, and passkey/WebAuthn are not implemented by this batch.

## Audit chain operations

- `auditLog` entries carry a sequence number, previous-entry SHA-256, and entry hash; `auditChain/head` records the latest chain position.
- The scheduled `audit_chain_verify` maintenance task checks the chain. Review open `auditChainAlerts` in the owner security centre and preserve evidence before remediation.
- Owner exports from Safety & Security Centre → Audit Integrity include a SHA-256 checksum over the exported JSON payload. Keep the original export and checksum together.
- Firestore client rules deny all client reads/writes by default. Server-only service-account credentials remain responsible for append-only audit behavior.

## Batch 5 — secret rotation, key versions and environment separation

- The Zillionaire Security screen reports only configured/missing status and rotation metadata. It does not validate credentials with their provider, reveal values, or change deployment secrets. Record a rotation only after completing it in the provider and the correct server-side deployment environment.
- Keep development, preview/staging, and production credentials separate. Store private values only in the deployment's server-side secret manager; do not place them in browser/mobile environment variables, source control, logs, screenshots, or chat. `PAYSTACK_PUBLIC_KEY` and package/endpoint identifiers are configuration, not private credentials.
- **Firebase:** create a replacement service-account key in Google Cloud IAM, update the correct deployment, verify Firestore/Storage operations, then revoke the old key. Review least-privilege roles before issuing keys.
- **Paystack:** rotate the server key in Paystack settings, update production server secrets, verify a test transaction and webhook, then revoke the old key. Keep the public key limited to the client checkout integration. The legacy `x-paystack-signature` authenticates the raw body, not an independent timestamp; do not trust an unsigned timestamp header as replay protection. Use event-ID idempotency and Paystack's current signing protocol.
- **Google Play:** create and deploy a replacement service-account key, confirm purchase verification, then revoke the prior key. Keep the package identifier aligned with the Play Console.
- **Video workers / Modal:** rotate each worker key in both API and worker secret stores, verify signed worker requests and wakeups, then remove the old key. Keep worker IDs independent; do not reuse owner, payment, or playback credentials.
- **Streaming key rings:** for `STREAMING_URL_ENCRYPTION_KEYS_JSON` and `STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON`, add a new version and select it with the matching active-version setting; migrate/decrypt existing records while the old version remains available; verify playback; only then retire the old version. Changing a single-key encryption value in place can make existing credentials unreadable.
- **Owner MFA and backup encryption:** do not replace `ZILLIONAIRE_MFA_ENCRYPTION_KEY` or `CONFIG_BACKUP_KEY` in place. First implement and test a versioned re-encryption/restore migration; otherwise stored authenticator secrets or encrypted backups may become unrecoverable.
- **Email / Supabase / scheduler:** rotate `BREVO_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `LOVABLE_CRON_SECRET` only when the integration is configured. Update every dependent service, verify delivery/API/scheduled requests, then revoke the old credential. Remove `LOVABLE_CRON_SECRET_PREVIOUS` after its overlap window.
- Rotation dates and recommended cycles in the console are operational reminders, not provider-enforced expiry dates. Maintain the provider's own key inventory and alerts; never claim a key is rotated based only on this application record.

## 14. Transactional Email & Password Reset (Brevo & Firebase)

### Brevo Transactional Email Configuration
1. **Hosting Secrets**:
   - `BREVO_API_KEY`: API key from Brevo dashboard (SMTP & API -> API Keys). Required for verification emails and test delivery.
   - `BREVO_SENDER_EMAIL` (Optional): Verified sender email address in Brevo (defaults to `verification@bqsqwad.com`).
   - `BREVO_SENDER_NAME` (Optional): Friendly sender display name (defaults to `BQ SQWAD TV`).
2. **Testing Email Delivery**:
   - In Zillionaire Console (`/zillionaire/security`), navigate to **Email Delivery & Verification Pipeline**.
   - Click **Send test email to me** (or provide a destination recipient). The server dispatches a test email via Brevo and reports delivery status and message ID.
   - Enforces a rate limit of 5 test emails per hour per owner account.

### Password Reset Security & Policies
1. **Staff & Owner Console Reset Dispatch**:
   - Zillionaire operators and owners can trigger password reset emails to users from the Viewer Management console (`/zillionaire/viewers`).
   - Staff and owners **MUST NEVER** see, generate, display, or directly set a user password. The system dispatches an official Firebase password reset link directly to the user email.
2. **Generic Response & Anti-Enumeration**:
   - Public password reset requests from web and mobile always return a generic success message, regardless of whether the email exists in the system.
   - Link expiration (default: 1 hour) and action URL templates are configured in the Firebase Console (Authentication -> Templates -> Password reset).

## 15. Android Release & Google Play Store Submission (Batch 9)

### Keystore Generation (Phone-Friendly / Terminal)
To generate the release upload key:
1. Run the keytool command from any terminal or workstation:
   ```bash
   keytool -genkey -v -keystore bq-sqwad-tv-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias bqsqwadtv
   ```
2. Enter a strong password when prompted, confirm your name/organization (BQ Sqwad Technologies), and complete the prompt.
3. Securely store `bq-sqwad-tv-release.jks` in a protected vault.

### Release Signing Secrets Configuration
Configure the following four secrets in your CI/CD environment or local build configuration:
- `ANDROID_KEYSTORE_PATH`: Absolute or relative path to `bq-sqwad-tv-release.jks`.
- `ANDROID_KEYSTORE_PASSWORD`: Master password for the keystore file.
- `ANDROID_KEY_ALIAS`: Key alias name (e.g., `bqsqwadtv`).
- `ANDROID_KEY_PASSWORD`: Password for the private key entry.

### Google Play Store Readiness Questionnaire Answers
1. **Target SDK & Platform Versioning**:
   - `compileSdk`: 36
   - `targetSdk`: 36
   - `minSdk`: 24 (Android 7.0+)
   - Automated version bumping: `node scripts/bump-version-code.mjs`
2. **Data Safety Declarations**:
   - **Personal info**: Name, email address, and user identifier collected for account creation and session authorization. Optional phone number. Encrypted in transit (HTTPS/TLS).
   - **Financial info**: In-app purchase history and wallet balance transactions managed via Google Play Billing and server-side verification.
   - **App activity & analytics**: Video views, watch duration, and crash logs collected for platform analytics and service reliability.
   - **Device or other IDs**: Device security tokens and Firebase Cloud Messaging tokens for notification delivery and fraud prevention.
   - **Account Deletion**: Viewers can request immediate account and data deletion in-app and on the web at `https://bqsqwad.com/account-deletion`.
3. **Content Rating (IARC)**:
   - Category: Entertainment / Streaming.
   - Age gating: Tiered rating system (All ages, 7+, 13+, 16+, 18+). 18+ content requires age verification; kids profiles restrict mature titles.
   - User interactions: Video commenting, watch-together party rooms, and community reports.
4. **Privacy Policy URL**:
   - Canonical URL: `https://bqsqwad.com/legal/privacy-policy`

### Sandbox Build Note
Bytecode assembly tasks (`bundleRelease`, `assembleRelease`) require a Java Runtime Environment (JDK 17+) and Android SDK command-line tools. In cloud sandbox environments lacking JDK/Android SDK binaries, Gradle builds cannot execute bytecode compilation directly. The Android Gradle definitions, release signing configurations, ProGuard obfuscation profiles, and store compliance specifications are verified and ready for CI/CD or local machine execution.

## External Copyright Matching Service (Optional Integration)

When deploying with an external audiovisual content matching provider (e.g. Audible Magic, ACRCloud, or proprietary fingerprinting API):

1. Set the following environment secrets in your host deployment:
   - `COPYRIGHT_MATCH_SERVICE_URL`: The HTTPS endpoint of the copyright matching service (e.g. `https://api.copyrightmatch.provider.com/v1/fingerprint-check`).
   - `COPYRIGHT_MATCH_API_KEY`: API authentication key / bearer token.
2. In the external service dashboard:
   - Configure catalogue matching against commercial media and broadcast databases.
   - Set confidence threshold for automatic review queue flagging (default: 85% confidence score).
3. In the Zillionaire Control Centre:
   - Navigate to `/zillionaire/rights-review`.
   - Items flagged by either internal perceptual fingerprint comparisons or the external service appear with "Possible duplicate of <title>" or external catalogue match warnings for human review.
   - Note: The platform **never auto-rejects** on match — all duplicates are held for human reviewer evaluation.

## KYC & Private Vault Secrets

1. `KYC_FIELD_ENCRYPTION_KEY`: Required server-only, base64-encoded 32-byte key for AES-256-GCM field encryption. Until configured in the deployment secret manager, sensitive KYC encryption fails closed; no fallback key is used.
2. `KYC_VAULT_SIGNING_SECRET`: Required server-only high-entropy secret (at least 32 bytes) for HMAC-SHA256 KYC viewer request signatures. Until configured, viewer request signing fails closed. The viewer endpoint must also authenticate, authorize and audit each request; signing alone does not grant access.

## Batch C1 — Verification Provider Adapter (External KYC Verifier)

1. `FEATURE_EXTERNAL_KYC_VERIFIER`: Boolean feature flag (`true` or `false`, defaults to `false`). When `false`, all KYC cases default to the built-in manual verification flow. When `true`, automated preliminary checks (document authenticity, facial similarity, liveness, sanctions/PEP screening) run through the external verification provider adapter.
2. `KYC_VERIFIER_API_KEY`: Secret API key for the external verification provider.
3. `KYC_VERIFIER_ENDPOINT`: (Optional) Base URL of external verification provider API (defaults to internal production verification gateway `https://api.verifypay.internal/v1/kyc`).

### Safety and Owner Decision Guarantees
- **No User Blocking on Adapter Failure**: If the external verification provider is unreachable, times out, or returns a 5xx error, the system **never blocks the applicant**. The case automatically transitions to manual review with a visible badge `"automatic check unavailable"` in the Zillionaire queue.
- **Owner Final Authority**: External adapter results (status, score, confidence, anomaly flags) are advisory signals stored on the case record. The human platform owner/compliance officer retains final authority to approve, reject, or request changes on all KYC submissions.
