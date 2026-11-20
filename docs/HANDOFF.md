Last verified work: v6-05-A1 key-handling hardening; A2 baseline exists but is incomplete.
Next batch: v6-05-A2 — searchable country-first KYC flow, then wire the country rules into the form.
Known gaps: KYC helpers are not integrated with persistence/private storage; no protected viewer/audit endpoint; provider picker is not searchable and lacks flags/dial codes.
Files touched: src/lib/server/kyc/types.ts, src/lib/server/kyc/storage.ts, src/test/batch-a1-kyc-storage.test.ts, docs/OWNER-ACTIONS.md, docs/DECISIONS.md, docs/HANDOFF.md.
Checks run: batch-a1 test (5 passed), build (clean), public-text scan (clean); broader typecheck has existing errors.
