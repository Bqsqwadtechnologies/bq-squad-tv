# BQ SQWAD TV — Money and wallet audit

Date: 17 November 2026  
Scope: File 05, batches 01–15  
Source reviewed: `money.ts`, `ledger.ts`, `pricing.ts`, `currency.ts`, wallet summary/ledger/top-up routes, Paystack and Google Play verification/credit routes, session start and settlement code.

## Monetary representation

- Wallet and ledger values are integer minor currency units. Never store a floating-point monetary value.
- `money.ts` uses BigInt for cumulative arithmetic and half-up rounding once at the cumulative session checkpoint. Incremental amounts are differences between cumulative totals so heartbeat boundaries do not create rounding drift.
- Currency precision is determined by `minorUnitDigits`: zero-, two- and three-decimal currencies are represented explicitly.
- No exchange-rate conversion is performed by the wallet path. A title or top-up without a configured amount in the viewer's currency must remain unavailable rather than silently converted.

## Session billing invariants

- The session must retain its currency and the selected price snapshot; later catalogue changes must not change an active session's price.
- A debit must be represented by an idempotent ledger entry in the same transaction as the wallet update.
- The wallet balance must never become negative. The current session path checks the available balance and configured daily limit transactionally; the planned ten-minute wallet hold and block-based settlement are not yet integrated.
- The current daily limit checks settled spending. Outstanding-hold accounting must be added together with the ten-minute hold before block settlement is enabled.
- Producer allocation uses the session's snapshotted basis points and integer division rounded down. The platform receives every remaining minor unit, so producer plus platform shares equal the viewer debit exactly. Heartbeat and final-session settlement now share the same `splitRevenueMinor` calculation.

## Payment verification

- Paystack webhook handling verifies the signature against the raw request body and re-verifies the transaction with the provider before crediting.
- Paystack credits are idempotent by provider reference and the wallet/ledger/payment update is transactional.
- Google Play purchase verification is server-side and account-bound. The purchase token is not persisted in plaintext. A consumable is consumed only after the idempotent credit transaction succeeds.
- Reconciliation is review-only: it must never rewrite an existing ledger entry. Corrections are new, reasoned entries.

## Audit integrity

- New audit records are linked by a monotonically increasing sequence and previous SHA-256 hash, with the head updated transactionally.
- The scheduled verifier checks every chained record in bounded pages and raises a security alert when a link, hash or head does not match.
- Historical audit records written before chain activation are not retroactively rewritten.

## Verification boundary

The existing money, wallet-ledger, Paystack, Google Play account-binding and session-metering tests cover selected arithmetic and payment invariants. The session-metering suite now also checks exact producer/platform reconciliation across NGN, USD, JPY and KWD with varied integer amounts. CI results are recorded against exact commits; a source commit alone is not evidence that a test passed.

## Remaining integration scope

This audit does not claim that the full File 05 feature set is complete. The remaining batches cover currency changes, wallet display parity, block settlement integration, provider reconciliation, viewer budgets, adult access, device registration, risk scoring, scalable rate limits, secure headers/CSRF/App Check, privacy export/deletion, encrypted payout data, and full regression verification.
