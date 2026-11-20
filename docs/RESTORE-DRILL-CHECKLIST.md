# Disaster Recovery & Restore Drill Checklist

**Owner Control Centre:** Zillionaire  
**Classification:** Maximum Security & Resilience  
**Frequency:** Quarterly Drill (Mandatory)  

---

## 1. Database Point-in-Time Recovery (PITR) Drill
1. [ ] **Verify Snapshot Integrity:** Confirm automated daily snapshot status in `/zillionaire/security` -> Platform Backups.
2. [ ] **Isolated Staging Restoration:**
   - Provision isolated staging project instance.
   - Run `gcloud firestore import` from Europe-west1 cold storage backup.
3. [ ] **Checksum & Row Verification:**
   - Reconcile `wallets`, `ledgerEntries`, `contentAssets`, and `users` records count.
   - Verify cryptographic hash chain on `auditEvents` table.
4. [ ] **Document Recovery Time Objective (RTO):** Confirm restoration completes within target window (< 45 minutes).
5. [ ] **Document Recovery Point Objective (RPO):** Confirm data delta is under target window (< 15 minutes).

---

## 2. Storage Dual-Replication & Failover Drill
1. [ ] **Primary Pool Simulation Failure:** Simulate secondary storage pool degradation.
2. [ ] **Automated Egress Reroute:** Verify stream delivery automatically falls back to secondary Backblaze B2 replica without interrupting active viewer playback sessions.
3. [ ] **HLS Segment Integrity Check:** Verify sample master and variant playlist playback under failover.

---

## 3. Emergency Incident Mode ("Panic Button") Drill
1. [ ] **Trigger Controlled Activation:**
   - Tap "Activate Panic Button" in `/zillionaire/security` -> Emergency Panic.
   - Enter audit reason: `Quarterly incident mode drill`.
2. [ ] **Verify Immediate Lockdown Enforcement:**
   - Confirm `/api/public/v1/payments/paystack/initialize` rejects payouts (`payoutFreeze: true`).
   - Confirm new viewer sign-ups return service notice (`signupsOpen: false`).
   - Confirm producer and provider consoles reject new session creation.
3. [ ] **Audit Trail Verification:** Confirm `security.panic_activated` event is written to tamper-evident audit log with actor ID.
4. [ ] **One-Tap Release:**
   - Tap "Release Incident Mode".
   - Confirm all normal operations resume immediately.
   - Confirm `security.panic_released` is recorded in audit ledger.
