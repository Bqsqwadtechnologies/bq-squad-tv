#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

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
  if (relative.startsWith("src/routes/api/") || relative.startsWith("src/lib/") || relative.endsWith("/README.md")) return false;
  return relative.startsWith("src/routes/") ||
    relative.startsWith("src/components/") ||
    relative.startsWith("android/") ||
    /^(emails?|email-templates?|legal|content\/legal|seed)\//i.test(relative) ||
    /^src\/(email-templates?|content\/legal|legal|seed)\//i.test(relative);
}

function visibleCandidates(content, relative) {
  if (relative.startsWith("android/")) {
    if (/\\/res\\/values(?:-[^/]+)?\\/.*\\.xml$/i.test(relative)) return content;
    const matches = [];
    for (const match of content.matchAll(/\\bText\\s*\\(\\s*["']([^"']+)["']/g)) matches.push(match[1]);
    for (const match of content.matchAll(/contentDescription\\s*=\\s*["']([^"']+)["']/g)) matches.push(match[1]);
    return matches.join("\\n");
  }
  if (/\\.(md|txt)$/i.test(relative) || /(^|\\/)(emails?|email-templates?|legal|content\\/legal|seed)(\\/|$)/i.test(relative)) return content;
  if (/\\.xml$/i.test(relative)) return content;
  const source = ts.createSourceFile(relative, content, ts.ScriptTarget.Latest, true, relative.endsWith(".tsx") || relative.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const matches = [];
  const visibleAttributes = new Set(["title", "aria-label", "aria-description", "placeholder", "alt", "label", "description", "subject"]);
  function visit(node) {
    if (ts.isJsxText(node)) {
      if (node.text.trim()) matches.push(node.text);
    } else if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source))) {
      const value = node.initializer;
      if (value && ts.isStringLiteral(value)) matches.push(value.text);
      else if (value && ts.isJsxExpression(value) && value.expression && ts.isStringLiteral(value.expression)) matches.push(value.expression.text);
    } else if (ts.isCallExpression(node) && ["Text", "Button", "Label", "Badge"].includes(node.expression.getText(source))) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) matches.push(first.text);
    } else if (ts.isPropertyAssignment(node) && ["title", "description"].includes(node.name.getText(source)) && ts.isStringLiteral(node.initializer)) {
      matches.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return matches.join("\\n");
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
