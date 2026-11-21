Last verified work: v6-05-A7 — Zillionaire KYC review queue (queue with pending/needs_changes/approved/rejected tabs, filters, copy-protected detail view, audited sensitive field reveal, document & face side-by-side zoom/rotate viewer, automated country-rule compliance checklist, approve/reject/request_changes/escalate/force_rekyc actions with email/in-app notifications and audit logging).
Next batch: v6-05-A8 — KYC end-to-end guards, tests and checklist across full flow.
Known gaps: Live SMS delivery requires production BREVO_API_KEY.
Files touched: src/routes/zillionaire.kyc.tsx, src/routes/api/public/v1/zillionaire/kyc/queue.ts, src/routes/api/public/v1/zillionaire/kyc/detail.ts, src/routes/api/public/v1/zillionaire/kyc/reveal.ts, src/routeTree.gen.ts, src/test/batch-a7-zillionaire-queue.test.ts.
Checks run: 37 vitest tests in 10 test files passed; production build succeeded; scan:public-text clean; security fail-closed verified.
