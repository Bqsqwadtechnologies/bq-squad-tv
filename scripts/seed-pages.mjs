#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pages = JSON.parse(await readFile(path.join(root, "content/legal/default-pages.json"), "utf8"));
const expected = new Set(["privacy-policy", "terms", "producer-terms", "producer-policy", "provider-terms"]);
const placeholders = [...new Set(pages.flatMap(page => [...page.body.matchAll(/\{\{([a-z0-9_]+)\}\}/g)].map(match => match[1])))].sort();
if (pages.length !== expected.size || pages.some(page => !expected.has(page.slug)) || new Set(pages.map(page => page.slug)).size !== pages.length) {
  throw new Error("The legal page seed list is incomplete or contains duplicate slugs.");
}
if (pages.some(page => typeof page.body !== "string" || !page.body.startsWith("# "))) {
  throw new Error("Every default legal page must contain a Markdown heading and body.");
}
console.log("Validated draft pages:", pages.map(page => page.slug).join(", "));
console.log("Unfilled placeholders:", placeholders.join(", "));
const baseUrl = process.env.BQ_SQWAD_TV_BASE_URL?.replace(/\\/$/, "");
const token = process.env.BQ_SQWAD_TV_OWNER_TOKEN;
if (!baseUrl || !token) {
  console.log("No remote write performed. Use the signed-in owner dashboard's Load default pages action, or set BQ_SQWAD_TV_BASE_URL and BQ_SQWAD_TV_OWNER_TOKEN in a secure local environment.");
  process.exit(0);
}
const response = await fetch(baseUrl + "/api/public/v1/admin/pages/seed", {
  method: "POST",
  headers: { authorization: "Bearer " + token, "content-type": "application/json" },
  body: JSON.stringify({ reason: "Load the original legal draft pages without replacing existing owner edits." }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error || "Could not seed the draft pages.");
console.log(JSON.stringify(result, null, 2));
