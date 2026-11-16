#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const forbiddenTerms = [
  "ZILLIONAIRE",
  "com.bqsqwad.tv",
  "Bqsqwadtechnologies/bq-squad-tv",
  "bq-sqwad-source-media",
  "bq-sqwad-streaming-media",
  "Lovable",
  "Backblaze",
  "GitHub",
  "TanStack",
  "Vite",
  "FFmpeg",
  "Cloudflare",
];

const root = process.cwd();

async function walk(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await walk(fullPath));
      else if (entry.isFile()) files.push(fullPath);
    }
    return files;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

function isOwnerOnlyRoute(file) {
  const relative = path.relative(path.join(root, "src/routes"), file).split(path.sep).join("/");
  return relative === "admin.index.tsx" || relative === "admin.storage.tsx" ||
    relative.startsWith("api/public/v1/admin/storage/") ||
    relative === "api/public/v1/admin/config/flags.ts";
}

function publicTextOnly(source) {
  return source
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
    .replace(/^\s*export\s+\{[\s\S]*?\};\s*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function shouldScan(file, scope) {
  const normalized = file.split(path.sep).join("/");
  if (scope === "routes" && isOwnerOnlyRoute(file)) return false;
  if (scope === "android" && !/\/res\/values(?:-[^/]+)?\//.test(normalized)) return false;
  if (/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4|webm|pdf)$/i.test(file)) return false;
  return /\.(tsx?|jsx?|html?|xml|json|md|txt)$/i.test(file);
}

const scopes = [
  ["src/routes", "routes"],
  ["public", "public"],
  ["android", "android"],
  ["emails", "named"],
  ["email-templates", "named"],
  ["legal", "named"],
  ["content/legal", "named"],
  ["src", "named"],
];

const findings = [];
for (const [directory, scope] of scopes) {
  for (const file of await walk(path.join(root, directory))) {
    if (!shouldScan(file, scope)) continue;
    if (scope === "named" && !/(email|legal|policy|terms|template)/i.test(path.basename(file))) continue;
    const content = publicTextOnly(await readFile(file, "utf8"));
    for (const term of forbiddenTerms) {
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      if (index >= 0) {
        const line = content.slice(0, index).split("\n").length;
        findings.push(path.relative(root, file) + ":" + line + ': forbidden public term "' + term + '"');
      }
    }
  }
}

if (findings.length) {
  process.stderr.write(findings.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Public-text scan passed.\n");
}
