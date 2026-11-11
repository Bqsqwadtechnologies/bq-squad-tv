export type ContentDeliveryMode = "external" | "bq_hosted";
export type ContentPlatform = "android" | "web";

export type ContentAccessInput = {
  contentStatus: string;
  assetStatus: string;
  deliveryMode: string;
  licenseStatus: string;
  commercialOnlineStreaming: boolean;
  paidStreaming: boolean;
  allowedTerritories: readonly string[];
  allowedPlatforms: readonly string[];
  territory: string;
  platform: ContentPlatform;
  validFrom?: string | null;
  validUntil?: string | null;
  now?: Date;
};

export type ContentAccessDecision =
  | { allowed: true; deliveryMode: ContentDeliveryMode }
  | {
      allowed: false;
      reason:
        | "CONTENT_NOT_PUBLISHED"
        | "ASSET_NOT_READY"
        | "DELIVERY_MODE_INVALID"
        | "LICENSE_NOT_VERIFIED"
        | "RIGHTS_SCOPE_INSUFFICIENT"
        | "TERRITORY_NOT_LICENSED"
        | "PLATFORM_NOT_LICENSED"
        | "LICENSE_NOT_YET_VALID"
        | "LICENSE_EXPIRED";
    };

/**
 * Evaluates the normalized rights facts required before playback authorization.
 * Callers must load these facts from trusted server-side records; never pass
 * client-supplied license, territory, platform or publication claims.
 */
export function evaluateContentAccess(input: ContentAccessInput): ContentAccessDecision {
  if (input.contentStatus !== "published") {
    return { allowed: false, reason: "CONTENT_NOT_PUBLISHED" };
  }
  if (input.assetStatus !== "ready") {
    return { allowed: false, reason: "ASSET_NOT_READY" };
  }
  if (input.deliveryMode !== "external" && input.deliveryMode !== "bq_hosted") {
    return { allowed: false, reason: "DELIVERY_MODE_INVALID" };
  }
  if (input.licenseStatus !== "verified") {
    return { allowed: false, reason: "LICENSE_NOT_VERIFIED" };
  }
  if (!input.commercialOnlineStreaming || !input.paidStreaming) {
    return { allowed: false, reason: "RIGHTS_SCOPE_INSUFFICIENT" };
  }
  if (!input.allowedTerritories.includes(input.territory.toUpperCase())) {
    return { allowed: false, reason: "TERRITORY_NOT_LICENSED" };
  }
  if (!input.allowedPlatforms.includes(input.platform)) {
    return { allowed: false, reason: "PLATFORM_NOT_LICENSED" };
  }

  const now = (input.now ?? new Date()).getTime();
  if (input.validFrom) {
    const validFrom = Date.parse(input.validFrom);
    if (!Number.isFinite(validFrom) || now < validFrom) {
      return { allowed: false, reason: "LICENSE_NOT_YET_VALID" };
    }
  }
  if (input.validUntil) {
    const validUntil = Date.parse(input.validUntil);
    if (!Number.isFinite(validUntil) || now >= validUntil) {
      return { allowed: false, reason: "LICENSE_EXPIRED" };
    }
  }

  return { allowed: true, deliveryMode: input.deliveryMode };
}
