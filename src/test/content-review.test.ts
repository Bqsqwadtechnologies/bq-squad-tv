import { describe, expect, it } from "vitest";
import { validateContentApprovalRequirements } from "@/lib/server/content-review";

const validAsset = () => ({
  status: "processed_pending_review",
  license: { status: "verified", verificationStatus: "verified", territoryCodes: ["NG", "US"] },
  territoryCodes: ["NG"],
  ageRating: "TV-14",
  posterObjectKey: "posters/asset_123.webp",
  expectedObjectCount: 8,
  uploadedObjectCount: 8,
  masterPlaylistValid: true,
  allSegmentsVerified: true,
  hlsVerifiedAt: "2026-11-17T12:00:00.000Z",
});

describe("content approval requirements", () => {
  it("accepts an asset only when every required review field is present", () => {
    expect(validateContentApprovalRequirements(validAsset())).toEqual({
      posterKey: "posters/asset_123.webp",
      ageRating: "TV-14",
      territoryCount: 1,
    });
  });

  it.each([
    [
      "wrong review state",
      (asset: Record<string, unknown>) => {
        asset["status"] = "ready";
      },
    ],
    [
      "unverified rights",
      (asset: Record<string, unknown>) => {
        asset["license"] = {
          status: "pending",
          verificationStatus: "pending",
          territoryCodes: ["NG"],
        };
      },
    ],
    [
      "missing rights territories",
      (asset: Record<string, unknown>) => {
        asset["license"] = {
          status: "verified",
          verificationStatus: "verified",
          territoryCodes: [],
        };
      },
    ],
    [
      "territory outside license",
      (asset: Record<string, unknown>) => {
        asset["territoryCodes"] = ["NG", "GB"];
      },
    ],
    [
      "missing age rating",
      (asset: Record<string, unknown>) => {
        asset["ageRating"] = "";
      },
    ],
    [
      "missing poster",
      (asset: Record<string, unknown>) => {
        asset["posterObjectKey"] = "";
      },
    ],
    [
      "unsafe poster path",
      (asset: Record<string, unknown>) => {
        asset["posterObjectKey"] = "../poster.webp";
      },
    ],
    [
      "invalid master playlist",
      (asset: Record<string, unknown>) => {
        asset["masterPlaylistValid"] = false;
      },
    ],
    [
      "unverified segments",
      (asset: Record<string, unknown>) => {
        asset["allSegmentsVerified"] = false;
      },
    ],
    [
      "mismatched object counts",
      (asset: Record<string, unknown>) => {
        asset["uploadedObjectCount"] = 7;
      },
    ],
    [
      "missing HLS verification time",
      (asset: Record<string, unknown>) => {
        asset["hlsVerifiedAt"] = null;
      },
    ],
  ])("rejects approval when %s", (_label, mutate) => {
    const asset = validAsset();
    mutate(asset);
    expect(() => validateContentApprovalRequirements(asset)).toThrow();
  });
});
