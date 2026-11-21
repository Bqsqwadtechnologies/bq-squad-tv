import { describe, it, expect } from "vitest";
import {
  isAge18OrOlder,
  fuzzyNameMatch,
  validateIdFormat,
  validateTaxIdFormat,
  validateCompanyRegistrationFormat,
} from "../lib/kyc-country-rules";

describe("Batch A4: Producer KYC (Personal and Business)", () => {
  it("enforces 18+ age verification for individual producers", () => {
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = String(today.getUTCMonth() + 1).padStart(2, "0");
    const day = String(today.getUTCDate()).padStart(2, "0");

    // Exactly 18 years ago today
    const exactly18 = `${year - 18}-${month}-${day}`;
    expect(isAge18OrOlder(exactly18)).toBe(true);

    // 25 years ago
    const older = `${year - 25}-01-01`;
    expect(isAge18OrOlder(older)).toBe(true);

    // 17 years ago (minor)
    const minor = `${year - 17}-${month}-${day}`;
    expect(isAge18OrOlder(minor)).toBe(false);

    // Invalid formats
    expect(isAge18OrOlder("")).toBe(false);
    expect(isAge18OrOlder("not-a-date")).toBe(false);
    expect(isAge18OrOlder("1995/05/20")).toBe(false);
  });

  it("performs fuzzy name matching between KYC legal entity and payout account", () => {
    // Exact match
    const exact = fuzzyNameMatch("Chukwuemeka Adebayo", "Chukwuemeka Adebayo");
    expect(exact.matches).toBe(true);
    expect(exact.score).toBe(1.0);

    // Reordered names (common in official Nigerian bank accounts: Surname Firstname)
    const reordered = fuzzyNameMatch("Adebayo Chukwuemeka", "Chukwuemeka Adebayo");
    expect(reordered.matches).toBe(true);
    expect(reordered.score).toBe(1.0);

    // Business name with Ltd / Limited variation
    const biz = fuzzyNameMatch("Blue Lagoon Studios Limited", "Blue Lagoon Studios Ltd");
    expect(biz.matches).toBe(true);
    expect(biz.score).toBeGreaterThanOrEqual(0.6);

    // Completely mismatched names
    const mismatch = fuzzyNameMatch("John Doe", "Amina Bello");
    expect(mismatch.matches).toBe(false);
    expect(mismatch.score).toBe(0);

    // Empty names
    expect(fuzzyNameMatch("", "John Doe").matches).toBe(false);
  });

  it("validates country-specific company registration formats for business producers", () => {
    // Nigeria CAC RC or BN
    expect(validateCompanyRegistrationFormat("NG", "RC1234567").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("NG", "BN9876543").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("NG", "INVALID_REG").valid).toBe(false);

    // UK Companies House (8 characters)
    expect(validateCompanyRegistrationFormat("GB", "12345678").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("GB", "SC123456").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("GB", "123").valid).toBe(false);

    // US State Entity (at least 5 characters alphanumeric)
    expect(validateCompanyRegistrationFormat("US", "C1234567").valid).toBe(true);
  });

  it("validates personal ID types and tax numbers for producers across countries", () => {
    // US Passport (9 digits)
    expect(validateIdFormat("US", "passport", "123456789").valid).toBe(true);
    expect(validateIdFormat("US", "passport", "123").valid).toBe(false);

    // US EIN / SSN
    expect(validateTaxIdFormat("US", "12-3456789").valid).toBe(true);
    expect(validateTaxIdFormat("US", "123").valid).toBe(false);

    // Nigeria NIN (11 digits)
    expect(validateIdFormat("NG", "nin", "12345678901").valid).toBe(true);
    expect(validateIdFormat("NG", "nin", "12345").valid).toBe(false);
  });
});
