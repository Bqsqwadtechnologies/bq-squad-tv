#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const indexesPath = path.resolve(process.cwd(), "firestore.indexes.json");
if (!fs.existsSync(indexesPath)) {
  console.error("firestore.indexes.json does not exist!");
  process.exit(1);
}

const indexesData = JSON.parse(fs.readFileSync(indexesPath, "utf8"));
const indexes = indexesData.indexes || [];

console.log(`Checking Firestore indexes (${indexes.length} definitions found)...`);

const validGroups = new Set(indexes.map((idx) => idx.collectionGroup));

console.log(`Defined collection groups with composite indexes:`);
for (const group of validGroups) {
  const count = indexes.filter((i) => i.collectionGroup === group).length;
  console.log(`  - ${group} (${count} composite ${count === 1 ? "index" : "indexes"})`);
}

// Ensure critical compound queries are indexed
const requiredIndexes = [
  { group: "ledger", fields: ["uid", "kind", "createdAt"] },
  { group: "payments", fields: ["uid", "createdAt"] },
  { group: "sessions", fields: ["uid", "startedAt"] },
  { group: "contentAssets", fields: ["featured", "status", "contentStatus", "featureRank"] },
  { group: "contentComments", fields: ["assetId", "status", "createdAt"] },
  { group: "payouts", fields: ["uid", "createdAt"] },
];

let missing = 0;
for (const req of requiredIndexes) {
  const match = indexes.find((idx) => {
    if (idx.collectionGroup !== req.group) return false;
    const idxFields = (idx.fields || []).map((f) => f.fieldPath);
    return req.fields.every((f) => idxFields.includes(f));
  });
  if (!match) {
    console.error(`MISSING required index for ${req.group}: fields [${req.fields.join(", ")}]`);
    missing++;
  }
}

if (missing > 0) {
  console.error(`Failed: ${missing} required composite indexes are missing from firestore.indexes.json`);
  process.exit(1);
}

console.log("All required Firestore composite indexes verified successfully.");
process.exit(0);
