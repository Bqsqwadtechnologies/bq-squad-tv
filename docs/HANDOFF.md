Last verified work: v6-05-A6 — Camera capture, active/passive liveness challenges, ID/passport alignment framing, quality heuristics, desktop phone handoff QR, and producer flow integration.
Next batch: v6-05-A7 — Zillionaire KYC review queue (owner sees all details, audited reveal, document viewer, reasoned approve/reject).
Known gaps: Zillionaire owner review queue UI and audited reveal actions implemented next in A7; live SMS delivery requires production BREVO_API_KEY.
Files touched: src/components/kyc/KycCameraCapture.tsx, src/components/ProducerKycFlow.tsx, src/test/batch-a6-camera-capture.test.tsx.
Checks run: 35 vitest tests in 10 test files passed; build succeeded; scan:public-text clean; fail-closed security verified.
