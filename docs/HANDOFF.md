# Project Handoff

## Current Status
- All Batches in Prompt V6-05 Complete & Verified: Batches A1–A8, B1–B8, and C1–C6 are finished and verified.
- Test suite status: 152 automated tests passing across 23 test files.
- Route integrity: 380 route files generated and registered in `src/routeTree.gen.ts`.
- Production build: Clean `vite build` and Nitro server build passing.
- Standing checks: `bun run scan:public-text`, `check:route-integrity`, and no "admin" routes or "KYB" terminology anywhere.
- Next prompt: Proceed to `V6-06-Continue-File03-Features-Policies.md`.

## Master Verification Checklist for Owner / Tester
1. Pick a country from the dynamic 193-country picker (e.g. Nigeria, United Kingdom, or United States).
2. Verify phone number via Brevo SMS / WhatsApp OTP with rate limiting and retry backoff.
3. Capture government ID (front/back or data page) and real-time face liveness selfie.
4. Submit as an individual producer (personal NIN/passport) and as a company provider (CAC / CRN / EIN).
5. Review application in Zillionaire KYC console, inspect risk score, and approve.
6. Verify producer tools unlock immediately upon approval.
7. Test rejection with structured canned reasons and resubmission workflow.
8. Add country-locked payout account (Nigeria with bank directory and auto-detected details; UK with sort code; US with routing number).
9. Request a payout over $500 minimum threshold.
10. In Zillionaire Payouts console, copy transfer details with single-tap audited copy in exact ALAT order.
11. Mark payout as PAID with optional settlement reference and PDF receipt attachment.
12. Verify email settlement receipt delivered to applicant outbox; confirm "ALAT" or "Wema" never appear on pre-payment user screens.
