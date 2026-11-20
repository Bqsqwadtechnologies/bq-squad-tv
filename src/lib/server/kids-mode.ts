export type KidsModeProfile = {
  isKidsMode: boolean;
  parentalPinSet: boolean;
  allowedRatings: string[];
};

export const KIDS_ALLOWED_RATINGS = new Set(["G", "TV-Y", "TV-Y7", "TV-G", "PG"]);

export function isContentAllowedForKids(rating: string | null | undefined): boolean {
  if (!rating) return true; // Unrated content treated conservatively
  return KIDS_ALLOWED_RATINGS.has(rating.toUpperCase().trim());
}

export function canKidsProfileAccessChat(isKidsMode: boolean): boolean {
  return !isKidsMode;
}

export function canKidsProfileReceiveAds(isKidsMode: boolean): boolean {
  return !isKidsMode;
}
