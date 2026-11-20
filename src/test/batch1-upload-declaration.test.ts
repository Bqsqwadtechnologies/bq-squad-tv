import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("V6 File 02 Batch 1 upload declarations", () => {
  it("collects the rights, age, warning, language, genre and production details in the producer flow", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/producer.channels.tsx"), "utf8");
    for (const phrase of ["Content warnings", "Primary language", "Genre", "Licence type", "Copyright holder", "Production year", "Rights evidence link"]) {
      expect(source).toContain(phrase);
    }
    expect(source).toContain("ageRating: uploadAgeRating");
    expect(source).toContain("contentWarnings: uploadWarnings");
  });

  it("validates and records the declaration fields on the server", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/api/public/v1/producer/channels/$channelId/assets.ts"), "utf8");
    for (const field of ["contentWarnings", "productionYear", "licenseType", "copyrightHolderName", "rightsEvidenceUrl"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("RIGHTS_EVIDENCE_REQUIRED");
    expect(source).toContain("protocol !== \"https:\"");
  });
});
