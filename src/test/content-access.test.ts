import { describe, expect, it } from "vitest";
import { evaluateContentAccess, type ContentAccessInput } from "@/lib/server/content-access";

const base: ContentAccessInput = {
  contentStatus: "published",
  assetStatus: "ready",
  deliveryMode: "external",
  licenseStatus: "verified",
  commercialOnlineStreaming: true,
  paidStreaming: true,
  allowedTerritories: ["NG", "GH"],
  allowedPlatforms: ["android", "web"],
  territory: "NG",
  platform: "android",
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2027-01-01T00:00:00.000Z",
  now: new Date("2026-11-11T00:00:00.000Z"),
};

describe("rights-aware content access", () => {
  it("allows published, ready content within verified paid-streaming rights", () => {
    expect(evaluateContentAccess(base)).toEqual({ allowed: true, deliveryMode: "external" });
    expect(evaluateContentAccess({ ...base, deliveryMode: "bq_hosted" })).toEqual({
      allowed: true,
      deliveryMode: "bq_hosted",
    });
  });

  it("fails closed for unpublished content, unready assets and invalid delivery modes", () => {
    expect(evaluateContentAccess({ ...base, contentStatus: "draft" })).toMatchObject({
      allowed: false, reason: "CONTENT_NOT_PUBLISHED",
    });
    expect(evaluateContentAccess({ ...base, assetStatus: "processing" })).toMatchObject({
      allowed: false, reason: "ASSET_NOT_READY",
    });
    expect(evaluateContentAccess({ ...base, deliveryMode: "proxy" })).toMatchObject({
      allowed: false, reason: "DELIVERY_MODE_INVALID",
    });
  });

  it("requires verified commercial paid-streaming rights", () => {
    expect(evaluateContentAccess({ ...base, licenseStatus: "pending" })).toMatchObject({
      allowed: false, reason: "LICENSE_NOT_VERIFIED",
    });
    expect(evaluateContentAccess({ ...base, commercialOnlineStreaming: false })).toMatchObject({
      allowed: false, reason: "RIGHTS_SCOPE_INSUFFICIENT",
    });
    expect(evaluateContentAccess({ ...base, paidStreaming: false })).toMatchObject({
      allowed: false, reason: "RIGHTS_SCOPE_INSUFFICIENT",
    });
  });

  it("enforces territory, platform and license term", () => {
    expect(evaluateContentAccess({ ...base, territory: "US" })).toMatchObject({
      allowed: false, reason: "TERRITORY_NOT_LICENSED",
    });
    expect(evaluateContentAccess({ ...base, platform: "web", allowedPlatforms: ["android"] })).toMatchObject({
      allowed: false, reason: "PLATFORM_NOT_LICENSED",
    });
    expect(evaluateContentAccess({ ...base, validFrom: "2027-01-01T00:00:00.000Z" })).toMatchObject({
      allowed: false, reason: "LICENSE_NOT_YET_VALID",
    });
    expect(evaluateContentAccess({ ...base, validUntil: "2026-11-10T00:00:00.000Z" })).toMatchObject({
      allowed: false, reason: "LICENSE_EXPIRED",
    });
  });
});
