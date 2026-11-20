import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routesDir = path.join(root, "src/routes");
const treeFile = path.join(root, "src/routeTree.gen.ts");
if (!fs.existsSync(treeFile)) {
  console.error("Missing generated route tree. Run `bun run build` first.");
  process.exit(1);
}
const routeTree = fs.readFileSync(treeFile, "utf8");
const files = [];
function visit(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".test.tsx") && !entry.name.startsWith("-")) files.push(file);
  }
}
visit(routesDir);
const missing = [];
const seen = new Map();
let checked = 0;
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/createFileRoute\(\s*["']([^"']+)["']/);
  if (!match) continue;
  checked += 1;
  const routePath = match[1];
  const relative = path.relative(routesDir, file).replace(/\\/g, "/").replace(/\.(tsx?|jsx?)$/, "");
  const importPath = `./routes/${relative}`;
  if (!routeTree.includes(importPath) || !routeTree.includes(routePath)) missing.push(`${relative}: ${routePath}`);
  const previous = seen.get(routePath);
  if (previous) missing.push(`duplicate route ${routePath}: ${previous}, ${relative}`);
  else seen.set(routePath, relative);
}
if (missing.length) {
  console.error(`Route integrity failed (${missing.length} issue(s)):`);
  for (const issue of missing) console.error(`- ${issue}`);
  process.exit(1);
}
console.log(`Route integrity passed: ${checked} route files are represented in src/routeTree.gen.ts with no duplicate route paths.`);
