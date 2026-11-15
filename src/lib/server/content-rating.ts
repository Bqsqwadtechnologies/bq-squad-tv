import { ApiError } from "./firebase-admin";

const adultOnlyRatings = new Set([
  "18", "18+", "r", "nc-17", "tv-ma", "ma15+", "r18", "r18+", "adult", "xxx",
]);

function normalizeRating(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, "") : "";
}

/**
 * Enforce adult-only labels on the server. A client-supplied age flag is never
 * accepted; callers must pass the server-derived adult eligibility result.
 */
export function assertContentAgeEligibility(
  adultEligible: boolean,
  adultOnly: boolean,
  contentRating: unknown,
): void {
  const rating = normalizeRating(contentRating);
  if (!adultEligible && (adultOnly || adultOnlyRatings.has(rating))) {
    throw new ApiError(403, "AGE_RESTRICTED", "This content is restricted to verified adult viewers.");
  }
}
