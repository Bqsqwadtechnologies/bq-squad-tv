import { ApiError } from "./firebase-admin";
import { isSafeStoragePath } from "./storage/security";

export function validateContentApprovalRequirements(asset: Record<string, unknown>): {
  posterKey: string;
  ageRating: string;
  territoryCount: number;
} {
  if (asset["status"] !== "processed_pending_review") {
    throw new ApiError(409, "ASSET_NOT_AWAITING_REVIEW", "This video is not waiting for review.");
  }
  const license = asset["license"] as Record<string, unknown> | undefined;
  if (license?.["status"] !== "verified" || license["verificationStatus"] !== "verified") {
    throw new ApiError(403, "CONTENT_RIGHTS_NOT_VERIFIED", "Verified distribution rights are required.");
  }
  const rawAssetTerritories = asset["territoryCodes"] ?? asset["territories"];
  const assetTerritories = Array.isArray(rawAssetTerritories)
    ? rawAssetTerritories.filter((value): value is string => typeof value === "string").map(value => value.trim().toUpperCase())
    : [];
  const rightsTerritories = Array.isArray(license["territoryCodes"])
    ? license["territoryCodes"].filter((value): value is string => typeof value === "string").map(value => value.trim().toUpperCase())
    : [];
  if (!assetTerritories.length || !rightsTerritories.length ||
      assetTerritories.some(territory => !rightsTerritories.includes(territory))) {
    throw new ApiError(409, "CONTENT_TERRITORY_INVALID", "The video's viewing countries do not match the verified rights.");
  }
  const ageRating = typeof asset["ageRating"] === "string" ? asset["ageRating"].trim().toUpperCase() : "";
  if (!["TV-Y", "TV-Y7", "TV-G", "TV-PG", "TV-14", "TV-MA", "G", "PG", "PG-13", "12", "12A", "15", "16", "18", "R", "NC-17"].includes(ageRating)) {
    throw new ApiError(409, "CONTENT_AGE_RATING_REQUIRED", "Choose a valid age rating before approval.");
  }
  const posterKey = typeof asset["posterObjectKey"] === "string"
    ? asset["posterObjectKey"]
    : typeof asset["posterPath"] === "string" ? asset["posterPath"] : "";
  if (!posterKey || !isSafeStoragePath(posterKey)) {
    throw new ApiError(409, "CONTENT_POSTER_REQUIRED", "A poster image is required before approval.");
  }
  const expected = typeof asset["expectedObjectCount"] === "number" ? asset["expectedObjectCount"] : 0;
  const uploaded = typeof asset["uploadedObjectCount"] === "number" ? asset["uploadedObjectCount"] : 0;
  if (asset["masterPlaylistValid"] !== true || asset["allSegmentsVerified"] !== true ||
      expected < 2 || uploaded !== expected || asset["hlsVerifiedAt"] == null) {
    throw new ApiError(409, "CONTENT_PROCESSING_CHECKS_FAILED", "The processed video has not passed every file and playlist check.");
  }
  return { posterKey, ageRating, territoryCount: assetTerritories.length };
}
