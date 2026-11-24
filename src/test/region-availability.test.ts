import { describe, expect, it } from "vitest";
import { isAvailableInRegion } from "@/lib/server/region-availability";

describe("regional content availability", () => {
  it("allows global content in every region", () => {
    expect(isAvailableInRegion({ mode: "GLOBAL", countries: [] }, "NG")).toBe(true);
  });

  it("allows only selected countries on a whitelist", () => {
    const rule = { mode: "WHITELIST" as const, countries: ["NG", "GH"] };
    expect(isAvailableInRegion(rule, "NG")).toBe(true);
    expect(isAvailableInRegion(rule, "US")).toBe(false);
    expect(isAvailableInRegion(rule, null)).toBe(false);
  });

  it("blocks selected countries on a blacklist", () => {
    const rule = { mode: "BLACKLIST" as const, countries: ["NG"] };
    expect(isAvailableInRegion(rule, "NG")).toBe(false);
    expect(isAvailableInRegion(rule, "GH")).toBe(true);
  });

  it("respects scheduled availability windows", () => {
    const now = Date.parse("2026-11-24T12:00:00.000Z");
    const rule = {
      mode: "GLOBAL" as const,
      availableFrom: "2026-11-25T00:00:00.000Z",
      availableTo: "2026-12-01T00:00:00.000Z",
    };
    expect(isAvailableInRegion(rule, "NG", now)).toBe(false);
    expect(isAvailableInRegion(rule, "NG", Date.parse("2026-11-26T12:00:00.000Z"))).toBe(true);
  });
});
