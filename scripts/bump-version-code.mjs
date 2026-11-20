#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

const gradleFile = path.resolve(process.cwd(), "android/app/build.gradle.kts");

if (!fs.existsSync(gradleFile)) {
  console.error("build.gradle.kts not found at:", gradleFile);
  process.exit(1);
}

let content = fs.readFileSync(gradleFile, "utf-8");

const versionCodeMatch = content.match(/versionCode\s*=\s*(\d+)/);
if (!versionCodeMatch) {
  console.error("Could not find versionCode in build.gradle.kts");
  process.exit(1);
}

const currentCode = parseInt(versionCodeMatch[1], 10);
const nextCode = currentCode + 1;

content = content.replace(/versionCode\s*=\s*\d+/, `versionCode = ${nextCode}`);

// Optional: bump patch version in versionName if passed as flag or standard increment
const versionNameMatch = content.match(/versionName\s*=\s*"([^"]+)"/);
if (versionNameMatch && process.argv.includes("--bump-version-name")) {
  const parts = versionNameMatch[1].split(".");
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10) + 1;
    const nextName = `${parts[0]}.${parts[1]}.${patch}`;
    content = content.replace(/versionName\s*=\s*"[^"]+"/, `versionName = "${nextName}"`);
    console.log(`Bumped version to code ${nextCode}, name ${nextName}`);
  }
} else {
  console.log(`Bumped versionCode: ${currentCode} -> ${nextCode}`);
}

fs.writeFileSync(gradleFile, content, "utf-8");
