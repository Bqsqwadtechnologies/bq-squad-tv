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
- The wallet balance must never become negative. Any hold is reserved before playback and counts against available funds and applicable limits.
- Daily spending checks must include settled spending and outstanding holds.
- Producer/provider allocation is calculated from the session's snapshotted basis points. The platform receives the exact integer remainder so shares sum to the viewer debit.

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

The existing `src/test/money.test.ts`, `src/test/wallet-ledger.test.ts`, `src/test/paystack-credit.test.ts`, and `src/test/google-play-account-binding.test.ts` cover selected arithmetic and payment invariants. File 05 changes must add focused tests for every new policy. CI results are recorded in the implementation report; a source commit alone is not evidence that a test passed.

## Remaining integration scope

This audit does not claim that the full File 05 feature set is complete. The remaining batches cover currency changes, wallet display parity, block settlement integration, provider reconciliation, viewer budgets, adult access, device registration, risk scoring, scalable rate limits, secure headers/CSRF/App Check, privacy export/deletion, encrypted payout data, and full regression verification.
