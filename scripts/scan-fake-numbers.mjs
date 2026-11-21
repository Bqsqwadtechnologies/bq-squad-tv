#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

const targetDirs = [
  "src/routes",
  "src/components",
  "android/app/src/main",
];

const ignoredDirs = new Set(["node_modules", ".git", "build", "dist", ".gradle", "test", "__tests__"]);

const forbiddenPatterns = [
  {
    name: "hardcoded-change-trend",
    pattern: /\b(?:change|subtitle|changePercent)\s*[:=]\s*(?:\{\s*value:\s*)?["'][+↑↗▲]\s*\d+(?:\.\d+)?%["']/i,
    description: "Hardcoded positive/negative percentage trend in prop",
  },
  {
    name: "hardcoded-kpi-trend-text",
    pattern: /["'][+↑↗▲]\s*\d+(?:\.\d+)?%\s*(?:this month|vs last month|reach|growth|indexed|increase)["']/i,
    description: "Hardcoded trend percentage string in display copy",
  },
  {
    name: "synthetic-sine-wave-metric",
    pattern: /Math\.(?:sin|cos)\s*\([^)]+\)\s*\*/,
    description: "Sinusoidal synthetic metric curve generation",
  },
  {
    name: "demo-channel-id-link",
    pattern: /params=\{\{\s*channelId:\s*["']demo["']\s*\}\}/,
    description: "Hardcoded 'demo' channel ID navigation link",
  },
];

async function walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirs.has(entry.name)) {
        files.push(...(await walk(path.join(dir, entry.name))));
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (
        [".ts", ".tsx", ".js", ".jsx", ".kt", ".java"].includes(ext) &&
        !entry.name.includes(".test.") &&
        !entry.name.includes(".spec.")
      ) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  return files;
}

const findings = [];

for (const dir of targetDirs) {
  const fullPath = path.join(root, dir);
  const files = await walk(fullPath);
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const content = await readFile(file, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      for (const rule of forbiddenPatterns) {
        if (rule.pattern.test(lineText)) {
          findings.push({
            file: relative,
            line: i + 1,
            rule: rule.name,
            description: rule.description,
            text: lineText.trim(),
          });
        }
      }
    }
  }
}

if (findings.length > 0) {
  process.stderr.write(`\x1b[31mFake numbers scan found ${findings.length} violation(s):\x1b[0m\n\n`);
  for (const f of findings) {
    process.stderr.write(`  ${f.file}:${f.line} - [${f.rule}] ${f.description}\n`);
    process.stderr.write(`    > ${f.text}\n\n`);
  }
  process.exitCode = 1;
} else {
  process.stdout.write("\x1b[32mFake-numbers scan passed:\x1b[0m No fabricated metrics, mock trends, or synthetic sine wave numbers found.\n");
}
