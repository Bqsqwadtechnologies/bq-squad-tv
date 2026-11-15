import { describe, expect, it } from "vitest";
import { assertContentAgeEligibility } from "@/lib/server/content-rating";

describe("server-side content age rating", () => {
  it("blocks adult-only labels for viewers without verified adult eligibility", () => {
    expect(() => assertContentAgeEligibility(false, true, "PG")).toThrowError(
      expect.objectContaining({ code: "AGE_RESTRICTED" }),
    );
    expect(() => assertContentAgeEligibility(false, false, "18+")).toThrowError(
      expect.objectContaining({ code: "AGE_RESTRICTED" }),
    );
    expect(() => assertContentAgeEligibility(false, false, "TV-MA")).toThrowError(
      expect.objectContaining({ code: "AGE_RESTRICTED" }),
    );
  });

  it("allows general ratings without treating them as adult-only", () => {
    expect(() => assertContentAgeEligibility(false, false, "G")).not.toThrow();
    expect(() => assertContentAgeEligibility(false, false, "PG-13")).not.toThrow();
    expect(() => assertContentAgeEligibility(false, false, "16+")).not.toThrow();
  });

  it("allows adult-rated content only when adult eligibility is server verified", () => {
    expect(() => assertContentAgeEligibility(true, true, "18+")).not.toThrow();
    expect(() => assertContentAgeEligibility(true, false, "R")).not.toThrow();
  });
});
