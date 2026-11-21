Last verified work: v6-05-A5 — Provider Corporate KYC (company-only, business domain verification, representative authentication, fuzzy corporate payout matching, draft auto-save/resume).
Next batch: v6-05-A6 — Camera capture, liveness and ID framing.
Known gaps: Live camera liveness and edge/glare/blur ID framing is implemented next in A6; live SMS delivery requires production BREVO_API_KEY.
Files touched: src/lib/kyc-country-rules.ts, src/lib/server/kyc/persistence.ts, src/lib/server/kyc/types.ts, src/routes/api/public/v1/provider/verification.ts, src/routes/api/public/v1/provider/verification/draft.ts, src/test/batch-a5-provider-kyc.test.ts.
Checks run: 32 vitest tests in 9 test files passed; build succeeded; scan:public-text clean; fail-closed security verified.
