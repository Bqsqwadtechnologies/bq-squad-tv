import { ApiError, type Firestore } from "./firebase-admin";

export type PricingConfig = Record<string, unknown> & { version: number };

/** Pricing is read only from the single versioned config/pricing document. */
export async function getPricingConfig(fs: Firestore): Promise<PricingConfig> {
  const config = await fs.getDoc("config/pricing");
  if (!config) throw new ApiError(503, "PRICING_NOT_CONFIGURED", "Platform pricing has not been configured.");
  const version = config["version"];
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) {
    throw new ApiError(503, "PRICING_CONFIG_INVALID", "Platform pricing configuration is invalid.");
  }
  return { ...config, version };
}

export function requireMinorUnitAmount(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(400, "INVALID_PRICE", `${fieldName} must be a non-negative integer in minor currency units.`);
  }
  return value;
}
