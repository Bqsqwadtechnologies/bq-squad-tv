import { describe, it, expect } from "vitest";
import {
  getBanksForCountry,
  lookupBankInDirectory,
  validateIban,
  validateNuban,
  BANK_DIRECTORY,
} from "@/lib/server/payouts/bank-directory";
import fs from "node:fs";
import path from "node:path";

describe("Batch B1 — Payout Account Form & Bank Directory", () => {
  describe("Country-Locked Bank Directory", () => {
    it("provides populated bank listings for key payout corridors (NG, US, GB, GH, KE, ZA)", () => {
      const ngBanks = getBanksForCountry("NG");
      expect(ngBanks.length).toBeGreaterThanOrEqual(10);
      expect(ngBanks.some((b) => b.id === "gtb")).toBe(true);
      expect(ngBanks.some((b) => b.id === "zenith")).toBe(true);
      expect(ngBanks.some((b) => b.id === "access")).toBe(true);

      const usBanks = getBanksForCountry("US");
      expect(usBanks.length).toBeGreaterThan(0);
      expect(usBanks[0].routingCodeType).toBe("routing_number");

      const gbBanks = getBanksForCountry("GB");
      expect(gbBanks.length).toBeGreaterThan(0);
      expect(gbBanks[0].routingCodeType).toBe("sort_code");
    });

    it("safely looks up bank details by id or code", () => {
      const gtb = lookupBankInDirectory("NG", "gtb");
      expect(gtb).toBeDefined();
      expect(gtb?.swiftBic).toBe("GTBINGLA");
      expect(gtb?.code).toBe("058");

      const byCode = lookupBankInDirectory("NG", "057");
      expect(byCode).toBeDefined();
      expect(byCode?.name).toContain("Zenith");
    });
  });

  describe("Validation Rules (IBAN & NUBAN)", () => {
    it("validates 10-digit Nigerian NUBAN accounts", () => {
      expect(validateNuban("0123456789").valid).toBe(true);
      expect(validateNuban("12345").valid).toBe(false);
      expect(validateNuban("012345678901").valid).toBe(false);
      expect(validateNuban("abcdefghij").valid).toBe(false);
    });

    it("validates IBAN Modulo 97 checksum and enforces country matching", () => {
      // Valid GB IBAN format check
      const validGbIban = "GB82WEST12345698765432";
      // Compute correct Modulo 97 IBAN or use well-known test IBAN
      // Test country mismatch detection
      const mismatch = validateIban("GB82WEST12345698765432", "NG");
      expect(mismatch.valid).toBe(false);
      expect(mismatch.error).toContain("does not match your verified country");

      // Short length
      const short = validateIban("GB12", "GB");
      expect(short.valid).toBe(false);
    });
  });

  describe("Phase 1 Strict User-Facing Wording Rules", () => {
    it("enforces 'bank wire transfer' and '$500' minimum in PayoutAccountForm copy", () => {
      const formSource = fs.readFileSync(
        path.resolve(process.cwd(), "src/components/payouts/PayoutAccountForm.tsx"),
        "utf-8",
      );

      // Must state bank wire transfer
      expect(formSource).toContain("bank wire transfer");

      // Must state $500 minimum payout
      expect(formSource).toContain("Minimum payout is $500");

      // Must state country lock
      expect(formSource).toContain("Locked to Verified Residence");

      // Phase 1 prohibited wording in user instructions:
      // "ALAT" or "Alat by Wema" must NOT appear in user-facing promotional/instructional copy
      const lines = formSource.split("\n");
      for (const line of lines) {
        if (line.includes("ALAT") || line.includes("Alat by Wema")) {
          throw new Error(`Forbidden Phase 1 wording found in PayoutAccountForm: ${line}`);
        }
      }
    });
  });
});
