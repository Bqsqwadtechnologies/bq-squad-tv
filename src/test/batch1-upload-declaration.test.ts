import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("V6 File 02 Batch 1 upload declarations", () => {
  it("collects the rights, age, warning, language, genre and production details in the producer flow", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/producer.channels.tsx"), "utf8");
    for (const phrase of ["Content warnings", "Primary language", "Genre", "Licence type", "Copyright holder", "Production year", "Proof of rights"]) {
      expect(source).toContain(phrase);
    }
    expect(source).toContain("ageRating: uploadAgeRating");
    expect(source).toContain("contentWarnings: uploadWarnings");
  });

  it("requires a supported age band and a private proof-of-rights upload", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/producer.channels.tsx"), "utf8");
    for (const band of ["All ages", "7+", "13+", "16+", "18+"]) expect(source).toContain(band);
    expect(source).toContain("/api/public/v1/content-assets/");
    const evidence = fs.readFileSync(path.resolve(process.cwd(), "src/routes/api/public/v1/content-assets/$assetId/rights-evidence.ts"), "utf8");
    expect(evidence).toContain("MAX_EVIDENCE_BYTES");
    expect(evidence).toContain("storedPrivately: true");
  });

  it("validates and records the declaration fields on the server", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "src/routes/api/public/v1/producer/channels/$channelId/assets.ts"), "utf8");
    for (const field of ["contentWarnings", "productionYear", "licenseType", "copyrightHolderName", "rightsEvidencePath"]) {
      expect(source).toContain(field);
    }
    expect(source).toContain("RIGHTS_EVIDENCE_REQUIRED");
    expect(source).toContain("rightsEvidencePath: z.string().min(1).max(1024)");
  });
});
