import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// Public routes allow-list (only strictly public/unauthenticated endpoints)
export const PUBLIC_ROUTE_ALLOWLIST = new Set([
  "/api/public/v1/auth/web/config",
  "/api/public/v1/auth/web/session",
  "/api/public/v1/auth/web/session/logout",
  "/api/public/v1/auth/web/session/refresh",
  "/api/public/v1/config/client",
  "/api/public/v1/contact",
  "/api/public/v1/pages/$slug",
  "/api/public/firebase-schema-inspect",
  "/api/public/v1/ads/campaigns",
  "/api/public/v1/epg/",
  "/api/public/v1/errors/beacon",
  "/api/public/v1/errors/report",
  "/api/public/v1/search/v2",
  "/api/public/v1/legal/consent",
  "/api/public/v1/monitoring/client-errors",
]);

function getFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const res = path.resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFiles(res));
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx") &&
      !entry.name.startsWith("-")
    ) {
      files.push(res);
    }
  }
  return files;
}

export function classifyRoute(filePath, content) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");

  // Console page routes
  if (relPath.startsWith("src/routes/zillionaire")) {
    return {
      type: "zillionaire module",
      guard: "Zillionaire Owner / Delegated Module Shell",
      details: "Protected console page shell",
    };
  }
  if (relPath.startsWith("src/routes/producer")) {
    return {
      type: "producer",
      guard: "Producer Verified Shell",
      details: "Protected producer page shell",
    };
  }
  if (relPath.startsWith("src/routes/provider")) {
    return {
      type: "provider",
      guard: "Provider Binding Shell",
      details: "Protected provider page shell",
    };
  }

  // Derive route path from createFileRoute
  const routeMatch = content.match(/createFileRoute\(\s*["']([^"']+)["'],?\s*\)/);
  const routePath = routeMatch ? routeMatch[1] : relPath;

  // Check allowlist
  if (PUBLIC_ROUTE_ALLOWLIST.has(routePath)) {
    return {
      type: "public",
      guard: "Public Allow-List",
      details: "Reviewed unauthenticated public endpoint",
    };
  }

  // Check Webhook signature
  if (content.includes("verifyPaystackSignature")) {
    return {
      type: "webhook signature",
      guard: "verifyPaystackSignature",
      details: "HMAC-SHA512 webhook signature verification",
    };
  }

  // Check Playback session token
  if (content.includes("verifyPlaybackToken")) {
    return {
      type: "playback token",
      guard: "verifyPlaybackToken",
      details: "Session lease / content playback token verification",
    };
  }

  // Check Worker signature / auth
  if (content.includes("requireVideoWorker") || content.includes("verifyWorkerSignature")) {
    return {
      type: "worker signature",
      guard: "requireVideoWorker",
      details: "Ed25519 / HMAC video worker signature check",
    };
  }

  // Check Cron secret
  if (content.includes("requireCron") || content.includes("CRON_SECRET")) {
    return {
      type: "cron secret",
      guard: "requireCron",
      details: "Internal platform cron secret bearer token",
    };
  }

  // Check Zillionaire module
  const zillionaireMatch = content.match(
    /(?:requireZillionaireModule|requireZillionaireModule|requireZillionaire)\s*\([^,]+,[^,]+,\s*["']([^"']+)["']\)/,
  );
  if (
    zillionaireMatch ||
    content.includes("requireAdmin") ||
    content.includes("requireZillionaire")
  ) {
    return {
      type: "zillionaire module",
      guard: "requireZillionaire",
      details: zillionaireMatch
        ? `Module: ${zillionaireMatch[1]}`
        : "Zillionaire Owner / Scope Check",
    };
  }

  // Check Producer
  if (content.includes("requireProducer") || content.includes("assertProducerOwns")) {
    return {
      type: "producer",
      guard: "requireProducer",
      details: "Active producer plan and resource ownership assert",
    };
  }

  // Check Provider
  if (content.includes("requireProvider") || content.includes("providerUsers/")) {
    return {
      type: "provider",
      guard: "requireProvider",
      details: "Active provider license and tenant membership",
    };
  }

  // Check Viewer
  if (
    content.includes("requireUser") ||
    content.includes("requireViewer") ||
    content.includes("requireAppCheck")
  ) {
    return {
      type: "viewer",
      guard: "requireViewer",
      details: "Authenticated Firebase viewer token + active account session",
    };
  }

  return {
    type: "unguarded",
    guard: "NONE",
    details: "DANGER: No recognised authentication or authorization guard found",
  };
}

export function buildMatrix() {
  const apiDir = path.join(ROOT, "src/routes/api");
  const consoleFiles = [
    ...getFiles(path.join(ROOT, "src/routes")).filter((f) => {
      const rel = path.relative(path.join(ROOT, "src/routes"), f).replace(/\\/g, "/");
      if (rel.startsWith("api/")) return false;
      const name = path.basename(f);
      return (
        name.startsWith("zillionaire") || name.startsWith("producer") || name.startsWith("provider")
      );
    }),
  ];
  const apiFiles = getFiles(apiDir);
  const allFiles = [...apiFiles, ...consoleFiles];

  const results = [];
  for (const f of allFiles) {
    const content = fs.readFileSync(f, "utf8");
    const routeMatch = content.match(/createFileRoute\(\s*["']([^"']+)["'],?\s*\)/);
    const routePath = routeMatch ? routeMatch[1] : "/" + path.relative(ROOT, f).replace(/\\/g, "/");
    const classification = classifyRoute(f, content);
    results.push({
      file: path.relative(ROOT, f).replace(/\\/g, "/"),
      route: routePath,
      ...classification,
    });
  }

  return results;
}

export function writeMatrixDoc() {
  const matrix = buildMatrix();
  matrix.sort((a, b) => a.route.localeCompare(b.route));

  let md = `# Route Access & Authorization Matrix\n\n`;
  md += `Automatically maintained by \`scripts/route-access-matrix.mjs\`.\n\n`;
  md += `Total scanned routes: **${matrix.length}**\n\n`;

  const counts = {};
  for (const row of matrix) {
    counts[row.type] = (counts[row.type] || 0) + 1;
  }

  md += `### Summary by Guard Class\n\n`;
  md += `| Guard Class | Count |\n|---|---|\n`;
  for (const [k, v] of Object.entries(counts)) {
    md += `| \`${k}\` | ${v} |\n`;
  }
  md += `\n### Inventory\n\n`;
  md += `| Route | Guard Class | Specific Guard | File |\n`;
  md += `|---|---|---|---|\n`;

  for (const row of matrix) {
    md += `| \`${row.route}\` | \`${row.type}\` | ${row.guard} (${row.details}) | \`${row.file}\` |\n`;
  }

  const outPath = path.join(ROOT, "docs/ROUTE-ACCESS-MATRIX.md");
  fs.writeFileSync(outPath, md, "utf8");
  return { matrix, counts };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { matrix, counts } = writeMatrixDoc();
  console.log(`Generated docs/ROUTE-ACCESS-MATRIX.md with ${matrix.length} routes.`);
  console.log(counts);
  const unguarded = matrix.filter((r) => r.type === "unguarded");
  if (unguarded.length > 0) {
    console.error(`ERROR: ${unguarded.length} unguarded routes found!`);
    for (const u of unguarded) {
      console.error(`  - ${u.route} (${u.file})`);
    }
    process.exit(1);
  }
}
