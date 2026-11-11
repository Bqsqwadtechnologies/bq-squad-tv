import { ApiError } from "./firebase-admin";

export type PlaybackPlatform = "android" | "web" | "android_tv";
export type ContentLicenseRecord = Record<string, unknown>;

export type ContentRightsRequest = {
  contentStatus: unknown;
  license: ContentLicenseRecord | null;
  viewerCountry: string;
  platform: PlaybackPlatform;
  paidPlayback?: boolean;
  now?: Date;
};

/**
 * Server-side authorization gate shared by external-provider and BQ-hosted
 * delivery. Missing rights data is a deny, never an implicit allow.
 */
export function assertContentPlaybackRights(input: ContentRightsRequest): void {
  if (input.contentStatus !== "published") {
    throw new ApiError(403, "CONTENT_NOT_PUBLISHED", "This content is not approved for playback.");
  }
  const license = input.license;
  if (!license || license["status"] !== "verified" || license["verificationStatus"] !== "verified") {
    throw new ApiError(403, "CONTENT_RIGHTS_UNVERIFIED", "Distribution rights for this content have not been verified.");
  }
  if (license["commercialStreamingAllowed"] !== true) {
    throw new ApiError(403, "COMMERCIAL_STREAMING_NOT_AUTHORIZED", "Commercial online streaming is not authorized by this license.");
  }
  if (input.paidPlayback !== false && license["payPerMinuteAllowed"] !== true) {
    throw new ApiError(403, "PAY_PER_VIEW_NOT_AUTHORIZED", "Paid per-minute streaming is not authorized by this license.");
  }

  const territory = input.viewerCountry.trim().toUpperCase();
  const territories = license["territoryCodes"];
  if (!/^[A-Z]{2}$/.test(territory) || !Array.isArray(territories) ||
      !territories.some((entry) => entry === "*" || (typeof entry === "string" && entry.toUpperCase() === territory))) {
    throw new ApiError(403, "TERRITORY_NOT_AUTHORIZED", "This content is not licensed in your territory.");
  }

  const platforms = license["platforms"];
  if (!Array.isArray(platforms) || !platforms.includes(input.platform)) {
    throw new ApiError(403, "PLATFORM_NOT_AUTHORIZED", "This content is not licensed for this playback platform.");
  }

  const now = input.now ?? new Date();
  const validFrom = typeof license["validFrom"] === "string" ? Date.parse(license["validFrom"]) : Number.NaN;
  const validUntil = typeof license["validUntil"] === "string" ? Date.parse(license["validUntil"]) : Number.NaN;
  if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || validUntil <= validFrom) {
    throw new ApiError(403, "LICENSE_TERM_INVALID", "The content license has an invalid validity period.");
  }
  if (now.getTime() < validFrom) {
    throw new ApiError(403, "LICENSE_NOT_YET_VALID", "This content license is not active yet.");
  }
  if (now.getTime() >= validUntil) {
    throw new ApiError(403, "LICENSE_EXPIRED", "The content license has expired.");
  }
}
