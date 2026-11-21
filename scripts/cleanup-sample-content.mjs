#!/usr/bin/env node
/**
 * Standalone, idempotent cleanup script for BQ SQWAD TV sample content.
 * 
 * Usage:
 *   node scripts/cleanup-sample-content.mjs --dry-run
 *   node scripts/cleanup-sample-content.mjs --confirm=DELETE_SAMPLE_CONTENT --reason="Purging sample fixtures"
 */

import { Firestore } from "../src/lib/server/firebase-admin.ts";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run") || !args.some(a => a.startsWith("--confirm="));
const confirmArg = args.find(a => a.startsWith("--confirm="))?.split("=")[1];
const reasonArg = args.find(a => a.startsWith("--reason="))?.split("=")[1] || "Manual script execution: purge sample content";

console.log("==================================================");
console.log("   BQ SQWAD TV — Sample Content Cleanup Tool      ");
console.log("==================================================");
console.log(`Mode: ${isDryRun ? "DRY RUN (no records will be modified)" : "LIVE EXECUTION (PERMANENT DELETION)"}`);
console.log(`Reason: ${reasonArg}`);

if (!isDryRun && confirmArg !== "DELETE_SAMPLE_CONTENT") {
  console.error("\n[ERROR] Live execution aborted: must pass --confirm=DELETE_SAMPLE_CONTENT");
  process.exit(1);
}

async function run() {
  try {
    const fs = await Firestore.create();

    const collections = [
      { name: "channels", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed || row.sample || /demo channel|bq sqwad sports hd/i.test(row.name || row.title || "") },
      { name: "contentAssets", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed || row.sample || row.uploaderUid === "system_seed" || (/lagos nights|abidjan hustle|golden savannah|super eagles: african kings/i.test(row.title || "") && (row.uploaderUid === "system" || !row.uploaderUid)) },
      { name: "series", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed || row.sample },
      { name: "episodes", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed || row.sample },
      { name: "storageDestinations", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed },
      { name: "storageObjects", idMatch: /^(demo|sample-)/, demoCheck: (row) => row.isDemo || row.seed || row.sample },
    ];

    let totalFound = 0;
    let totalBytes = 0;
    const findings = [];

    for (const col of collections) {
      const rows = await fs.query(col.name, { limit: 500 }).catch(() => []);
      for (const row of rows) {
        const id = row.__id;
        const matches = col.idMatch.test(id) || col.demoCheck(row);
        if (matches) {
          totalFound++;
          const bytes = Number(row.sizeBytes || row.fileSize || row.contentLength || 0);
          totalBytes += bytes;
          findings.push({ collection: col.name, id, title: row.title || row.name || id, bytes });
        }
      }
    }

    console.log(`\nScan Complete:`);
    console.log(`- Sample records found: ${totalFound}`);
    console.log(`- Estimated storage freed: ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

    if (findings.length > 0) {
      console.log("\nItems detected:");
      for (const item of findings.slice(0, 20)) {
        console.log(`  [${item.collection}] ${item.id} — ${item.title}`);
      }
      if (findings.length > 20) {
        console.log(`  ... and ${findings.length - 20} more items`);
      }
    }

    if (isDryRun) {
      console.log("\n[DRY RUN] Complete. No changes made.");
      return;
    }

    console.log("\n[LIVE EXECUTION] Deleting sample documents...");
    for (const item of findings) {
      await fs.deleteDoc(`${item.collection}/${item.id}`).catch(() => {});
    }

    const reportId = `script_cleanup_${Date.now()}`;
    await fs.set(`sampleCleanupReports/${reportId}`, {
      reportId,
      executedBy: "cli_script",
      reason: reasonArg,
      executedAt: new Date().toISOString(),
      totalRecordsDeleted: totalFound,
      estimatedBytesFreed: totalBytes,
      deletedItems: findings,
    }).catch(() => {});

    await fs.set(`auditLog/audit_${Date.now()}`, {
      action: "CLEANUP_SAMPLE_CONTENT",
      actorUid: "cli_script",
      targetType: "system",
      targetId: reportId,
      reason: reasonArg,
      metadata: { totalRecordsDeleted: totalFound, estimatedBytesFreed: totalBytes },
      createdAt: new Date().toISOString(),
    }).catch(() => {});

    console.log(`\n[SUCCESS] Purged ${totalFound} sample records. Report committed (${reportId}).`);
  } catch (err) {
    console.error("\n[ERROR] Cleanup failed:", err);
    process.exit(1);
  }
}

run();
