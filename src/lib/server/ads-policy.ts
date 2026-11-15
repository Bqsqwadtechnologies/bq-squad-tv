const blockedAdCategories = new Set([
  "gambling",
  "sports_betting",
  "casino",
  "wagering",
  "prediction_market",
  "lottery",
  "alcohol",
  "tobacco",
  "nicotine",
  "vaping",
  "adult_entertainment",
  "adult_dating",
  "pornography",
  "sexual_content",
  "weapons",
]);

const adultAgeRatings = new Set(["18", "18+", "r", "nc-17", "tv-ma", "adult", "mature"]);

export function isAdSuitableForViewer(
  campaign: Record<string, unknown>,
  adultEligible: boolean,
  viewerCountry: string,
): boolean {
  const category = typeof campaign["category"] === "string"
    ? campaign["category"].toLowerCase().replace(/[\s-]+/g, "_")
    : "";
  if (!category || blockedAdCategories.has(category)) return false;

  const rating = typeof campaign["ageRating"] === "string"
    ? campaign["ageRating"].trim().toLowerCase()
    : "";
  if (
    !adultEligible &&
    (campaign["adultOnly"] === true || campaign["ageRestricted"] === true || adultAgeRatings.has(rating))
  ) {
    return false;
  }

  const territories = campaign["territoryCodes"];
  if (
    Array.isArray(territories) &&
    territories.length > 0 &&
    (!viewerCountry || !territories.includes(viewerCountry))
  ) {
    return false;
  }
  return true;
}
