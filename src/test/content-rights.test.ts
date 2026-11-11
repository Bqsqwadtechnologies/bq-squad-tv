import { describe, expect, it } from "vitest";
import { assertContentPlaybackRights } from "@/lib/server/content-rights";

const validLicense = {
  status: "verified",
  verificationStatus: "verified",
  commercialStreamingAllowed: true,
  payPerMinuteAllowed: true,
  territoryCodes: ["NG"],
  platforms: ["android", "web"],
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
};

const base = {
  contentStatus: "published",
  license: validLicense,
  viewerCountry: "NG",
  platform: "android" as const,
  now: new Date("2026-11-11T00:00:00.000Z"),
};

describe("content playback rights", () => {
  it("allows playback only when publication and all license dimensions are valid", () => {
    expect(() => assertContentPlaybackRights(base)).not.toThrow();
  });

  it("denies unpublished or unverified content", () => {
    expect(() => assertContentPlaybackRights({ ...base, contentStatus: "pending" })).toThrow();
    expect(() => assertContentPlaybackRights({ ...base, license: null })).toThrow();
  });

  it("requires commercial and paid-streaming permission", () => {
    expect(() => assertContentPlaybackRights({
      ...base, license: { ...validLicense, commercialStreamingAllowed: false },
    })).toThrow();
    expect(() => assertContentPlaybackRights({
      ...base, license: { ...validLicense, payPerMinuteAllowed: false },
    })).toThrow();
  });

  it("enforces territory and platform restrictions", () => {
    expect(() => assertContentPlaybackRights({ ...base, viewerCountry: "GH" })).toThrow();
    expect(() => assertContentPlaybackRights({ ...base, platform: "android_tv" })).toThrow();
  });

  it("enforces license start and expiry dates", () => {
    expect(() => assertContentPlaybackRights({
      ...base, now: new Date("2025-12-31T23:59:59.000Z"),
    })).toThrow();
    expect(() => assertContentPlaybackRights({
      ...base, now: new Date("2027-01-01T00:00:00.000Z"),
    })).toThrow();
  });

  it("does not require pay-per-minute rights for explicitly free playback", () => {
    expect(() => assertContentPlaybackRights({
      ...base, paidPlayback: false, license: { ...validLicense, payPerMinuteAllowed: false },
    })).not.toThrow();
  });
});
