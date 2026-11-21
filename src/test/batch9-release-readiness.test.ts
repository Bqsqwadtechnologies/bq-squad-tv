import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Batch 9: Release Readiness & Play Store Compliance", () => {
  const gradlePath = path.resolve(process.cwd(), "android/app/build.gradle.kts");
  const proguardPath = path.resolve(process.cwd(), "android/app/proguard-rules.pro");
  const bumpScriptPath = path.resolve(process.cwd(), "scripts/bump-version-code.mjs");
  const ownerActionsPath = path.resolve(process.cwd(), "docs/OWNER-ACTIONS.md");

  it("ensures build.gradle.kts specifies targetSdk 36, signingConfig, and release optimization", () => {
    const gradle = fs.readFileSync(gradlePath, "utf-8");
    expect(gradle).toContain("targetSdk = 36");
    expect(gradle).toContain("compileSdk = 36");
    expect(gradle).toContain("minSdk = 24");
    expect(gradle).toContain("isMinifyEnabled = true");
    expect(gradle).toContain("isShrinkResources = true");
    expect(gradle).toContain("signingConfigs.create(\"release\")");
    expect(gradle).toContain("ANDROID_KEYSTORE_PATH");
    expect(gradle).toContain("ANDROID_KEYSTORE_PASSWORD");
    expect(gradle).toContain("ANDROID_KEY_ALIAS");
    expect(gradle).toContain("ANDROID_KEY_PASSWORD");
  });

  it("ensures proguard-rules.pro preserves critical dependencies", () => {
    const proguard = fs.readFileSync(proguardPath, "utf-8");
    expect(proguard).toContain("com.android.billingclient");
    expect(proguard).toContain("com.google.firebase");
    expect(proguard).toContain("androidx.media3");
    expect(proguard).toContain("retrofit2");
    expect(proguard).toContain("com.squareup.moshi");
    expect(proguard).toContain("dagger.hilt");
  });

  it("ensures versionCode bump script exists and is executable", () => {
    expect(fs.existsSync(bumpScriptPath)).toBe(true);
    const script = fs.readFileSync(bumpScriptPath, "utf-8");
    expect(script).toContain("versionCodeMatch");
    expect(script).toContain("versionCode = ${nextCode}");
  });

  it("ensures docs/OWNER-ACTIONS.md provides Play Store Data Safety and Keystore instructions", () => {
    const doc = fs.readFileSync(ownerActionsPath, "utf-8");
    expect(doc).toContain("ANDROID_KEYSTORE_PATH");
    expect(doc).toContain("ANDROID_KEYSTORE_PASSWORD");
    expect(doc).toContain("ANDROID_KEY_ALIAS");
    expect(doc).toContain("ANDROID_KEY_PASSWORD");
    expect(doc).toContain("https://tv.bqsqwad.com/account-deletion");
    expect(doc).toContain("https://tv.bqsqwad.com/legal/privacy-policy");
    expect(doc).toContain("`compileSdk`: 36");
    expect(doc).toContain("`targetSdk`: 36");
    expect(doc).toContain("Content Rating (IARC)");
    expect(doc).toContain("Data Safety Declarations");
  });
});
