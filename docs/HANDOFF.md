Last finished batch: V5-05 Batch 9 — Web/Android parity and release polish (Android safe areas, live maintenance and force-update gates; public sitemap and robots link).
Next batch: V5-05 Batch 10 — Final release hardening, full local suite, security review and checklist.
Known gaps: Offline encrypted downloads deferred to future release; Android native compilation could not run because the repository has no Gradle wrapper and system Gradle is unavailable.
Files touched: src/routes/sitemap.xml.ts, public/robots.txt, android/app/src/main/java/com/bqsqwad/tv/ui/BqSqwadTvApp.kt, android/app/src/main/java/com/bqsqwad/tv/data/auth/ProfileApi.kt, android/app/src/main/java/com/bqsqwad/tv/data/auth/AuthRepository.kt, docs/DECISIONS.md, docs/HANDOFF.md, docs/PUSH-LOG.md.
Tests run: web production build passed; 8 targeted viewer/auth tests passed; scan:public-text passed.
