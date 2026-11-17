#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const forbiddenTerms = [
  "Firebase", "Firestore", "SDK", "Supabase", "Lovable", "Modal",
  "Backblaze", "Backblaze B2", "B2", "bucket", "HMAC", "FFmpeg",
  "token", "nonce", "API", "JSON", "schema", "secret prefix",
  "service role", "service-role", "ZILLIONAIRE",
  "com.bqsqwad.tv", "Bqsqwadtechnologies/bq-squad-tv",
  "bq-sqwad-source-media", "bq-sqwad-streaming-media",
  "Cloudflare", "GitHub", "TanStack", "Vite",
];

const sourceExtensions = /\.(tsx?|jsx?|html?|xml|json|md|txt|kt|mjml|mustache|liquid)$/i;
const ignoredDirectories = new Set(["node_modules", ".git", "build", "dist", ".gradle"]);

async function walk(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...await walk(path.join(directory, entry.name)));
    } else if (entry.isFile()) files.push(path.join(directory, entry.name));
  }
  return files;
}

function isOwnerZillionaireException(file, term) {
  if (term.toLowerCase() !== "zillionaire") return false;
  const relative = path.relative(root, file).split(path.sep).join("/");
  return /^src\/routes\/admin(?:\.|\/)/.test(relative) ||
    relative === "src/routes/admin.index.tsx";
}

function publicSource(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import\s+[\s\S]*?;\s*$/gm, "")
    .replace(/^\s*export\s+\{[\s\S]*?\};\s*$/gm, "");
}

function isTarget(file) {
  const relative = path.relative(root, file).split(path.sep).join("/");
  if (!sourceExtensions.test(file)) return false;
  return relative.startsWith("src/routes/") ||
    relative.startsWith("src/components/") ||
    relative.startsWith("android/") ||
    /(^|\/)(emails?|email-templates?|legal|content\/legal|seed)(\/|$)/i.test(relative) ||
    /(email|legal|policy|terms|template|seed)/i.test(path.basename(file));
}

function visibleCandidates(content, relative) {
  if (relative.startsWith("android/")) {
    if (/\/res\/values(?:-[^/]+)?\/.*\.xml$/i.test(relative)) return content;
    const matches = [];
    for (const match of content.matchAll(/\bText\s*\(\s*["']([^"']+)["']/g)) matches.push(match[1]);
    for (const match of content.matchAll(/\bText\s*\([\s\S]{0,500}?\btext\s*=\s*["']([^"']+)["']/g)) matches.push(match[1]);
    for (const match of content.matchAll(/contentDescription\s*=\s*["']([^"']+)["']/g)) matches.push(match[1]);
    for (const match of content.matchAll(/semantics\s*\{[\s\S]{0,300}?contentDescription\s*=\s*["']([^"']+)["']/g)) matches.push(match[1]);
    return matches.join("\n");
  }
  if (/\.(md|txt)$/i.test(relative) || /(^|\/)(emails?|email-templates?|legal|content\/legal|seed)(\/|$)/i.test(relative)) return content;
  const matches = [];
  for (const match of content.matchAll(/>([^<>]+)</g)) matches.push(match[1]);
  const attrPattern = /(?:title|content|aria-label|aria-description|placeholder|alt|label|description|subject|text)\s*=\s*["'\`]([^"'\`]+)["'\`]/g;
  for (const match of content.matchAll(attrPattern)) matches.push(match[1]);
  // TanStack head() metadata is commonly expressed as object properties.
  const metadataPattern = /(?:^|[,{\s])(?:title|content)\s*:\s*["'`]([^"'`]+)["'`]/gm;
  for (const match of content.matchAll(metadataPattern)) matches.push(match[1]);
  // Catch literal strings rendered inside JSX expression containers.
  const expressionTextPattern = /\{\s*["'`]([^"'`]{2,})["'`]\s*\}/g;
  for (const match of content.matchAll(expressionTextPattern)) matches.push(match[1]);
  const textPattern = /<(?:Text|Button|Label|Badge|Alert|CardTitle|CardDescription)[^>]*>([^<>]+)</g;
  for (const match of content.matchAll(textPattern)) matches.push(match[1]);
  return matches.join("\n");
}

const findings = [];
for (const top of ["src/routes", "src/components", "android", "emails", "email-templates", "legal", "content/legal", "public", "src"]) {
  for (const file of await walk(path.join(root, top))) {
    if (!isTarget(file)) continue;
    const relative = path.relative(root, file).split(path.sep).join("/");
    const content = visibleCandidates(publicSource(await readFile(file, "utf8")), relative);
    for (const term of forbiddenTerms) {
      if (isOwnerZillionaireException(file, term)) continue;
      const index = content.toLowerCase().indexOf(term.toLowerCase());
      if (index < 0) continue;
      const line = content.slice(0, index).split("\n").length;
      findings.push(`${relative}:${line}: possible public wording contains "${term}"`);
    }
  }
}
const unique = [...new Set(findings)].sort();
if (unique.length) {
  process.stderr.write(unique.join("\n") + "\n");
  process.exitCode = 1;
} else {
  process.stdout.write("Public-text scan passed.\n");
}
