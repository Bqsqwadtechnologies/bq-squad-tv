import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STRINGS } from "@/lib/strings";

describe("File 02 - Brand, Tokens and Strings Integrity", () => {
  const root = path.resolve(__dirname, "../..");

  it("design tokens JSON exists and contains essential brand keys", () => {
    const tokensPath = path.join(root, "design/tokens.json");
    expect(fs.existsSync(tokensPath)).toBe(true);
    const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf8"));
    expect(tokens.colors.dark.background).toBeDefined();
    expect(tokens.colors.dark.primary).toBeDefined();
    expect(tokens.colors.light.background).toBeDefined();
    expect(tokens.defaultTheme).toBe("dark");
  });

  it("shared strings match between source en.json and strings.ts", () => {
    const jsonPath = path.join(root, "content/strings/en.json");
    expect(fs.existsSync(jsonPath)).toBe(true);
    const sourceStrings = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    expect(sourceStrings.app_name).toBe("BQ SQWAD TV");
    expect(sourceStrings.tagline).toBe("WATCH • STREAM • ENJOY");
    expect(STRINGS.app_name).toBe(sourceStrings.app_name);
    expect(STRINGS.tagline).toBe(sourceStrings.tagline);
  });

  it("Android strings.xml exists and contains shared strings", () => {
    const xmlPath = path.join(root, "android/app/src/main/res/values/strings.xml");
    expect(fs.existsSync(xmlPath)).toBe(true);
    const xml = fs.readFileSync(xmlPath, "utf8");
    expect(xml).toContain('name="app_name"');
    expect(xml).toContain("BQ SQWAD TV");
  });

  it("generated brand assets exist in public/brand and android res", () => {
    const webLogo = path.join(root, "public/brand/logo-horizontal.png");
    const webIcon = path.join(root, "public/brand/icon-mark.png");
    const androidMark = path.join(root, "android/app/src/main/res/drawable/bq_sqwad_tv_mark.png");
    expect(fs.existsSync(webLogo)).toBe(true);
    expect(fs.existsSync(webIcon)).toBe(true);
    expect(fs.existsSync(androidMark)).toBe(true);
  });

  it("Android Color.kt and Theme.kt match design token outputs", () => {
    const colorKt = path.join(root, "android/app/src/main/java/com/bqsqwad/tv/ui/theme/Color.kt");
    const themeKt = path.join(root, "android/app/src/main/java/com/bqsqwad/tv/ui/theme/Theme.kt");
    expect(fs.existsSync(colorKt)).toBe(true);
    expect(fs.existsSync(themeKt)).toBe(true);
    const colorContent = fs.readFileSync(colorKt, "utf8");
    expect(colorContent).toContain("DarkBackground");
    expect(colorContent).toContain("LightBackground");
  });
});
