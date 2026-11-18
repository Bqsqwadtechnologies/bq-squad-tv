# CI Baseline Report — File 01, Batch 01

Captured at initial CI activation (2026-11-18).

## Automated Suite Status

| Job | Status | Details |
|---|---|---|
| `build` | GREEN | Vite client build and TanStack Route generation pass without errors. |
| `lint` | GREEN | ESLint passes with 0 errors (13 warnings, non-blocking). `test-playback.ts` let-to-const fixed. |
| `public-text-scanner` | GREEN | No restricted public text or internal admin strings in public paths. |
| `unit-and-api-tests` | GREEN | 75 test suites, 348 unit/API tests passing (16.4s duration). |
| `role-isolation` | GREEN | 14 tests in `src/test/role-isolation.test.ts` pass cleanly. |
| `workflow-e2e` | GREEN | 3 end-to-end tests in `src/test/e2e-provider-workflows.test.ts` pass cleanly. |
| `typecheck` | RED | 89 typecheck errors in legacy routes due to incorrect `requireUser` destructuring (`{ user, fs }` instead of `requireUser` + `Firestore.create()`) and missing `AdminModule` scopes. Slated for fix in Batches 03–07. |

## Quick Fixes Applied
- `src/routes/api/public/v1/admin/providers/test-playback.ts`: Corrected `let testDetails` to `const testDetails` to clear ESLint `prefer-const` error.

## Remaining Items to Address in Next Batches
- **Batch 02:** Generate `route-access-matrix.mjs`, create `docs/ROUTE-ACCESS-MATRIX.md`, and add deny-by-default route guard Vitest test.
- **Batch 03:** Rename admin to Zillionaire across permissions, types, and Firestore fields; add migration route.
- **Batch 04:** Introduce `src/lib/server/access.ts` central access library to replace fragmented/faulty `requireUser` destructuring and eliminate the typecheck errors.
