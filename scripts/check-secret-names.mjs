#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const requiredSecretNames = [
  "ZILLIONAIRE_EMAIL",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "ADMIN_EMAIL",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
];

const ownerActions = await readFile(new URL("../docs/OWNER-ACTIONS.md", import.meta.url), "utf8");
const documented = new Set([...ownerActions.matchAll(/\b[A-Z][A-Z0-9_]{2,}\b/g)].map(match => match[0]));
const missingFromChecklist = requiredSecretNames.filter(name => !documented.has(name));
const missingFromEnvironment = requiredSecretNames.filter(name => !process.env[name]);

if (missingFromChecklist.length) {
  process.stdout.write("Secret names missing from docs/OWNER-ACTIONS.md: " + missingFromChecklist.join(", ") + "\n");
} else {
  process.stdout.write("All required secret names are documented in docs/OWNER-ACTIONS.md.\n");
}
if (missingFromEnvironment.length) {
  process.stdout.write("Secret names not present in this execution environment (values are never printed): " + missingFromEnvironment.join(", ") + "\n");
} else {
  process.stdout.write("All required secret names are present in this execution environment.\n");
}
if (missingFromChecklist.length || missingFromEnvironment.length) process.exitCode = 1;
