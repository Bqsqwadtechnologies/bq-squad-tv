import { canKidsProfileReceiveAds } from "@/lib/server/kids-mode";

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

const restrictedAgeRatings = new Set([
  "12",
  "12+",
  "13",
  "13+",
  "15",
  "15+",
  "16",
  "16+",
  "18",
  "18+",
  "pg-13",
  "tv-14",
  "r",
  "nc-17",
  "tv-ma",
  "adult",
  "mature",
]);

export type AdPlacement =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "companion"
  | "home_banner"
  | "web_banner"
  | "pre_roll"
  | "mid_roll"
  | "half_time"
  | "between_segments";

export type AdDevice = "phone" | "tablet" | "desktop" | "tv";
export type AdOrientation = "portrait" | "landscape" | "fullscreen";

export interface PlacementGeometry {
  placement: AdPlacement;
  isNonInterruptive: boolean;
  isStreamBreak: boolean;
  maxWidthPx?: number;
  maxHeightPx?: number;
  safeMarginPx: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
  supportedDevices: AdDevice[];
}

export const PLACEMENT_GEOMETRIES: Record<AdPlacement, PlacementGeometry> = {
  top: {
    placement: "top",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxHeightPx: 90,
    safeMarginPx: { top: 8, bottom: 8 },
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  bottom: {
    placement: "bottom",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxHeightPx: 90,
    safeMarginPx: { top: 8, bottom: 16 },
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  left: {
    placement: "left",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxWidthPx: 300,
    safeMarginPx: { left: 16, right: 8 },
    supportedDevices: ["desktop", "tablet"],
  },
  right: {
    placement: "right",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxWidthPx: 300,
    safeMarginPx: { left: 8, right: 16 },
    supportedDevices: ["desktop", "tablet"],
  },
  companion: {
    placement: "companion",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxWidthPx: 336,
    maxHeightPx: 280,
    safeMarginPx: { top: 12, bottom: 12 },
    supportedDevices: ["desktop", "tablet", "phone"],
  },
  home_banner: {
    placement: "home_banner",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxHeightPx: 250,
    safeMarginPx: { top: 16, bottom: 24 },
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  pre_roll: {
    placement: "pre_roll",
    isNonInterruptive: false,
    isStreamBreak: true,
    safeMarginPx: {},
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  mid_roll: {
    placement: "mid_roll",
    isNonInterruptive: false,
    isStreamBreak: true,
    safeMarginPx: {},
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  half_time: {
    placement: "half_time",
    isNonInterruptive: false,
    isStreamBreak: true,
    safeMarginPx: {},
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  between_segments: {
    placement: "between_segments",
    isNonInterruptive: false,
    isStreamBreak: true,
    safeMarginPx: {},
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
  web_banner: {
    placement: "web_banner",
    isNonInterruptive: true,
    isStreamBreak: false,
    maxHeightPx: 250,
    safeMarginPx: { top: 16, bottom: 24 },
    supportedDevices: ["desktop", "tablet", "phone", "tv"],
  },
};

/**
 * Normalizes slot string (handling both hyphens and underscores).
 */
export function normalizePlacement(slot: string): AdPlacement | null {
  const clean = slot.trim().toLowerCase().replace(/-/g, "_");
  if (clean in PLACEMENT_GEOMETRIES) {
    return clean as AdPlacement;
  }
  return null;
}

/**
 * True if an overlay or popup blocks the video picture.
 * Non-interruptive peripheral frames and sequential video breaks do not block picture.
 */
export function isOverlayBlockingPicture(slot: string): boolean {
  const norm = slot.trim().toLowerCase().replace(/-/g, "_");
  const forbiddenOverlays = new Set([
    "popup",
    "pop_up",
    "overlay",
    "center_overlay",
    "video_overlay",
    "floating_overlay",
    "player_overlay",
    "interstitial_overlay",
  ]);
  return forbiddenOverlays.has(norm);
}

/**
 * Validates whether an ad placement is allowed under brand safety and UX guidelines.
 */
export function isAdPlacementAllowed(params: {
  slot: string;
  isKidsMode?: boolean;
  channelAdultOnly?: boolean;
  device?: string;
  campaign?: Record<string, unknown>;
  adultEligible?: boolean;
  viewerCountry?: string;
}): { allowed: boolean; reason?: string } {
  const { slot, isKidsMode, channelAdultOnly, campaign, adultEligible, viewerCountry } = params;

  // 1. Strict picture protection: No popups or picture-blocking overlays
  if (isOverlayBlockingPicture(slot)) {
    return {
      allowed: false,
      reason: "Pop-ups and overlays blocking the video picture are strictly prohibited.",
    };
  }

  // 2. Validate placement slot
  const normPlacement = normalizePlacement(slot);
  if (!normPlacement) {
    return {
      allowed: false,
      reason: `Placement '${slot}' is unrecognized or unsupported.`,
    };
  }

  // 3. Kids mode protection
  if (isKidsMode && !canKidsProfileReceiveAds(true)) {
    return {
      allowed: false,
      reason: "Advertisements are disabled on Kids profiles.",
    };
  }

  // 4. Adult channel protection: No commercial brand ads on adult-only channels
  if (channelAdultOnly) {
    return {
      allowed: false,
      reason: "Advertising is excluded from adult-classified channels.",
    };
  }

  // 5. Campaign suitability (if campaign is supplied)
  if (campaign) {
    const suitable = isAdSuitableForViewer(
      campaign,
      Boolean(adultEligible),
      viewerCountry || "",
    );
    if (!suitable) {
      return {
        allowed: false,
        reason: "Campaign does not meet viewer rating or geographic suitability.",
      };
    }
  }

  return { allowed: true };
}

export function isAdSuitableForViewer(
  campaign: Record<string, unknown>,
  adultEligible: boolean,
  viewerCountry: string,
): boolean {
  const category =
    typeof campaign["category"] === "string"
      ? campaign["category"]
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_")
      : "";
  if (!category || blockedAdCategories.has(category)) return false;

  const rating =
    typeof campaign["ageRating"] === "string" ? campaign["ageRating"].trim().toLowerCase() : "";
  if (
    !adultEligible &&
    (campaign["adultOnly"] === true ||
      campaign["ageRestricted"] === true ||
      !rating ||
      restrictedAgeRatings.has(rating))
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
