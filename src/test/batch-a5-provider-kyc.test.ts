import { describe, it, expect } from "vitest";
import {
  isBusinessDomainEmail,
  fuzzyNameMatch,
  validateCompanyRegistrationFormat,
  validateTaxIdFormat,
} from "../lib/kyc-country-rules";

describe("Batch A5: Provider Corporate KYC", () => {
  it("enforces business domain emails and rejects consumer freemail providers", () => {
    // Consumer freemail should be rejected
    expect(isBusinessDomainEmail("partner@gmail.com")).toBe(false);
    expect(isBusinessDomainEmail("partner@googlemail.com")).toBe(false);
    expect(isBusinessDomainEmail("broadcast@yahoo.com")).toBe(false);
    expect(isBusinessDomainEmail("media@hotmail.com")).toBe(false);
    expect(isBusinessDomainEmail("contact@outlook.com")).toBe(false);
    expect(isBusinessDomainEmail("info@icloud.com")).toBe(false);
    expect(isBusinessDomainEmail("exec@proton.me")).toBe(false);

    // Legitimate corporate business domains should be accepted
    expect(isBusinessDomainEmail("ops@apexnetworks.com")).toBe(true);
    expect(isBusinessDomainEmail("compliance@metro-broadcast.co.uk")).toBe(true);
    expect(isBusinessDomainEmail("licensing@africamagic.tv")).toBe(true);
    expect(isBusinessDomainEmail("legal@silverbirdgroup.ng")).toBe(true);

    // Malformed addresses
    expect(isBusinessDomainEmail("")).toBe(false);
    expect(isBusinessDomainEmail("not-an-email")).toBe(false);
    expect(isBusinessDomainEmail("@nodomain.com")).toBe(false);
  });

  it("enforces corporate payout account name matching against exact legal company name", () => {
    const legalCompanyName = "Silverbird Communications Limited";

    // Exact corporate account match
    const exact = fuzzyNameMatch("Silverbird Communications Limited", legalCompanyName);
    expect(exact.matches).toBe(true);
    expect(exact.score).toBe(1.0);

    // Standard abbreviation match (Limited vs Ltd)
    const ltd = fuzzyNameMatch("Silverbird Communications Ltd", legalCompanyName);
    expect(ltd.matches).toBe(true);
    expect(ltd.score).toBeGreaterThanOrEqual(0.6);

    // Mismatched individual personal account name (fraud prevention)
    const personalAccount = fuzzyNameMatch("Ben Murray Bruce", legalCompanyName);
    expect(personalAccount.matches).toBe(false);
    expect(personalAccount.score).toBe(0);

    // Completely unrelated corporate entity
    const wrongCompany = fuzzyNameMatch("Apex Media Holdings PLC", legalCompanyName);
    expect(wrongCompany.matches).toBe(false);
  });

  it("validates corporate registration number formats for providers across countries", () => {
    // Nigeria CAC RC (Corporate)
    expect(validateCompanyRegistrationFormat("NG", "RC1234567").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("NG", "LLP123456").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("NG", "INVALID").valid).toBe(false);

    // UK Companies House (8 alphanumeric characters)
    expect(validateCompanyRegistrationFormat("GB", "12345678").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("GB", "SC123456").valid).toBe(true);
    expect(validateCompanyRegistrationFormat("GB", "123").valid).toBe(false);

    // South Africa CIPC (YYYY/NNNNNN/NN)
    expect(validateCompanyRegistrationFormat("ZA", "2020/123456/07").valid).toBe(true);
  });

  it("validates corporate tax identification numbers across countries", () => {
    // Nigeria FIRS TIN (10-12 digits)
    expect(validateTaxIdFormat("NG", "123456789012").valid).toBe(true);
    expect(validateTaxIdFormat("NG", "1234567890").valid).toBe(true);
    expect(validateTaxIdFormat("NG", "12").valid).toBe(false);

    // US EIN (XX-XXXXXXX)
    expect(validateTaxIdFormat("US", "12-3456789").valid).toBe(true);
    expect(validateTaxIdFormat("US", "12345").valid).toBe(false);

    // UK Corporation Tax UTR (10 digits)
    expect(validateTaxIdFormat("GB", "1234567890").valid).toBe(true);
  });
});
