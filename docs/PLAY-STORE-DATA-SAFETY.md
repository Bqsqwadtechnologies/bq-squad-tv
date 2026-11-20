# Google Play Store Data Safety Declaration & Answers

**Application:** BQ SQWAD TV  
**Package:** `com.bqsqwad.tv`  
**Version:** V5  

---

## 1. Overview
BQ SQWAD TV is committed to user privacy, data minimization, and regulatory compliance (including GDPR, NDPR, and Google Play Families Policy).

---

## 2. Data Types Collected & Handled

### A. Personal Info
- **Name / Display Name:** Optional. Used for profile personalization. Encrypted in transit.
- **Email Address:** Required for account creation, login, and billing receipts. Encrypted in transit.
- **User IDs:** System-generated unique identifier (`uid`). Used for app functionality, account management, and session state.

### B. Financial Info
- **Purchase History:** Wallet deposits and per-minute stream usage. Used for billing, payouts, and customer support.
- **Payment Details:** All card and bank details are handled directly by PCI-DSS compliant processors (Paystack/Google Play Billing). **BQ SQWAD TV never collects or stores raw credit card numbers, CVVs, or bank account credentials.**

### C. App Activity
- **App Interactions & Viewing History:** Streams watched, watch time, and ratings. Used for resume-playback, watch history, and content recommendations.
- **Client Error Reports:** Optional diagnostic logs stripped of tokens and PII for app stability.

### D. Device or Other Identifiers
- **Device IDs & Push Tokens:** Used for account security, concurrent stream enforcement, and transactional push notifications.

---

## 3. Security Practices
- **Encryption in Transit:** All network requests use TLS 1.3 / HTTPS.
- **Account Deletion:** Users can request immediate account deletion and data anonymisation at `/account` or via `POST /api/public/v1/account/delete`.
- **Retention & Anonymisation:** Non-transactional PII is deleted immediately upon request. Financial ledgers are retained for statutory tax requirements with user identities irreversibly anonymised.

---

## 4. Children's Privacy & Families Policy
- **Kids Mode:** Dedicated viewing mode with content restricted to G / TV-Y / TV-G ratings.
- **Parental PIN:** Multi-factor PIN protection required to exit Kids Mode or change parental restrictions.
- **No Chat & No Ads:** When Kids Mode is active, live chat and advertising SDKs are strictly disabled.
