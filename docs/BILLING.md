> **Canonical specification:** [MASTER_TECHNICAL_SPEC.md](MASTER_TECHNICAL_SPEC.md) supersedes any conflicting draft defaults in this legacy billing note. Producer revenue splits are contract-specific and versioned; no historical example percentage is an active default unless approved in an actual producer contract. The canonical rounding rule is cumulative half-up settlement with exact carry, not independent per-heartbeat rounding.

# Billing and revenue authority

## Authority
Lovable Cloud edge functions are the sole authority for wallet balances, session charging, purchase verification, refunds, ledger entries, producer earnings and revenue splits. Android may show a local per-second estimate, but it is informational only. The client never writes an authoritative balance.

## Session metering
1. `startSession` validates auth, server-calculated age, channel rights, geo restrictions, concurrent streams, wallet minimum and Play Integrity.
2. Server creates the session with serverStartTime, active pricing rule, idempotency key and signed expiring playback URL.
3. Android sends heartbeat every 15 seconds and on foreground/background transitions.
4. Server computes elapsed seconds from server timestamps and atomically updates wallet + ledger using Firestore transactions.
5. Server closes sessions on zero balance, policy failure or two missed heartbeats. `endSession` settles to exact server second and revokes token.
6. Store fractional per-second prices in integer micro-units of the smallest currency unit (NGN kobo micro-units). Never use floating point for authoritative settlement.

## Google Play top-ups
Android digital wallet credits use Google Play Billing one-time consumables only. Client sends purchase token to server; server verifies with Google Play Developer API and deduplicates tokens. Only after server confirms credit does Android consume the purchase. Pending, cancelled, invalid, refunded and revoked purchases must not create credit. Paystack remains web-only; do not use Paystack, bank transfer, external checkout or Google Pay for Android digital credits.

## Revenue allocation
Splits are server-configured, versioned and snapshotted on each settled session. The supplied brief describes suggested starting defaults: platform-owned channel keeps 50% with remainder handled by content agreement; partner-hosted channel uses 30% platform / 70% producer; full-control channel owner receives 70% and pays a one-time channel creation fee. These are proposed defaults from the brief, not verified existing repository settings. Admin can override per producer/channel with audit history.

## Display math
A local ticker may show ratePerMinute / 60 and add a display estimate to the last server-settled session total. Label it estimate. Wallet balance and time remaining come only from server responses. Stop playback when server says inactive or balance is exhausted.
