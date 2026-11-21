Last verified work: v6-05-A4 — Producer KYC onboarding flow (Personal 18+ and Business entity) with multi-step draft resume, country ID/tax validation, fuzzy payout-name matching, and secured document uploads.
Next batch: v6-05-A5 — Provider KYC onboarding (Corporate only, business domain verification, authorized representative verification, corporate payout match).
Known gaps: Camera liveness capture/framing handled in A6; live SMS delivery requires production BREVO_API_KEY.
Files touched: src/components/ProducerKycFlow.tsx, src/lib/kyc-country-rules.ts, src/lib/server/kyc/persistence.ts, src/lib/server/kyc/types.ts, src/routes/api/public/v1/producer/verification.ts, src/routes/api/public/v1/producer/verification/draft.ts, src/test/batch-a4-producer-kyc.test.ts, scripts/push_to_main.py.
Checks run: 26 vitest tests in 7 test files passed; build succeeded; scan:public-text clean; fail-closed security verified.
