import { describe, expect, it } from "vitest";
import { maskEmail, maskPaymentInstrument, anonymiseActorId } from "../lib/server/anonymisation";
import { redactString } from "../lib/server/security-redaction";
import {
  isContentAllowedForKids,
  canKidsProfileAccessChat,
  canKidsProfileReceiveAds,
} from "../lib/server/kids-mode";

describe("Privacy and Compliance (Batch 8)", () => {
  it("masks emails and payment instruments safely", () => {
    expect(maskEmail("isaac@example.com")).toBe("i***c@example.com");
    expect(maskEmail("ab@domain.com")).toBe("a*@domain.com");
    expect(maskEmail(null)).toBe("anonymous@domain.local");

    expect(maskPaymentInstrument("4242", "Visa")).toBe("Visa ending in 4242");
    expect(maskPaymentInstrument(null)).toBe("Payment Method");

    expect(anonymiseActorId("user_1234567890")).toBe("anon_user...7890");
  });

  it("redacts credit card numbers and bank account numbers", () => {
    // Visa card number
    const withVisa = "Customer paid with 4111111111111111 on checkout";
    expect(redactString(withVisa)).toContain("[REDACTED_CARD]");
    expect(redactString(withVisa)).not.toContain("4111111111111111");

    // Mastercard number
    const withMC = "Card: 5500000000000004 charged";
    expect(redactString(withMC)).toContain("[REDACTED_CARD]");

    // Bank account
    const withBank = "account_number: 1234567890 for settlement";
    expect(redactString(withBank)).toContain("[REDACTED_ACCOUNT]");
  });

  it("enforces children's privacy gates", () => {
    expect(canKidsProfileAccessChat(true)).toBe(false);
    expect(canKidsProfileAccessChat(false)).toBe(true);

    expect(canKidsProfileReceiveAds(true)).toBe(false);
    expect(canKidsProfileReceiveAds(false)).toBe(true);

    expect(isContentAllowedForKids("G")).toBe(true);
    expect(isContentAllowedForKids("TV-Y")).toBe(true);
    expect(isContentAllowedForKids("TV-MA")).toBe(false);
    expect(isContentAllowedForKids("R")).toBe(false);
  });
});
