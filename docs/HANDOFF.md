Last finished batch: v6-05-R1 — Verification rename sweep (all verification unified under KYC)
Next batch: v6-05-A1 — Data model and private storage
Known gaps: None. All legacy verification terms unified to KYC.
Files touched: src/routes/zillionaire.support-macros.tsx, src/lib/server/kyc-migration.ts, src/test/no-legacy-verification-names.test.ts, docs/HANDOFF.md, docs/PUSH-LOG.md, docs/DECISIONS.md
Checks run: vitest run src/test/no-legacy-verification-names.test.ts (passed), bun run build (clean), bun run scan:public-text (clean).
