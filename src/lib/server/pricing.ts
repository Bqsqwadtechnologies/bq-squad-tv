import { ApiError, type Firestore } from "./firebase-admin";

export type RateSourceRule =
  | "event_window"
  | "episode_override"
  | "title_rate"
  | "series_rate"
  | "channel_rate"
  | "category_rate"
  | "platform_default";

export type ResolvedRate = {
  ratePerMinuteMinor: number;
  microPerSecond: number; // ratePerMinuteMinor * 1_000_000 / 60
  sourceRule: RateSourceRule;
  effectiveFrom: string;
  effectiveUntil: string | null;
  version: number;
};

export type PricingResolutionContext = {
  now?: number; // epoch ms
  channelId?: string | null;
  assetId?: string | null;
  seriesId?: string | null;
  episodeId?: string | null;
  categoryId?: string | null;
  platformDefaultMinor?: number;
};

export type EventWindow = {
  id: string;
  channelId: string;
  startIso: string;
  endIso: string;
  ratePerHourMinor: number;
  title?: string;
};

export type PricingConfig = {
  version: number;
  defaultRatePerMinuteMinor: number;
  categoryRatesMinor?: Record<string, number>;
  channelRatesPerHourMinor?: Record<string, number>;
  seriesRatesPerMinuteMinor?: Record<string, number>;
  titleRatesPerMinuteMinor?: Record<string, number>;
  episodeRatesPerMinuteMinor?: Record<string, number>;
  eventWindows?: EventWindow[];
  effectiveDate?: string;
  updatedAt?: string;
};

export async function getPricingConfig(fs: Firestore): Promise<PricingConfig> {
  const config = await fs.getDoc("config/pricing");
  if (!config) {
    return {
      version: 1,
      defaultRatePerMinuteMinor: 200, // NGN default 2.00 NGN/min (approx 120 NGN/hr)
    };
  }
  const version = typeof config["version"] === "number" ? config["version"] : 1;
  const defaultRatePerMinuteMinor =
    typeof config["defaultRatePerMinuteMinor"] === "number"
      ? config["defaultRatePerMinuteMinor"]
      : 200;

  return {
    ...config,
    version,
    defaultRatePerMinuteMinor,
  } as PricingConfig;
}

/**
 * Pure rate resolver implementing the Prompt 3 B2 precedence hierarchy:
 * 1. Active programme/event window on channel (live) or episode override
 * 2. Title rate (VOD)
 * 3. Series rate
 * 4. Channel default rate (entered per hour -> converted to per minute)
 * 5. Category default rate
 * 6. Platform default rate
 */
export function resolveRate(
  config: PricingConfig,
  context: PricingResolutionContext,
): ResolvedRate {
  const now = context.now ?? Date.now();
  const version = config.version || 1;
  const baseEffectiveFrom = config.effectiveDate || new Date(0).toISOString();

  // 1a. Channel Event/Programme Time Window
  if (context.channelId && config.eventWindows && Array.isArray(config.eventWindows)) {
    const activeWindow = config.eventWindows.find((w) => {
      if (w.channelId !== context.channelId) return false;
      const startMs = Date.parse(w.startIso);
      const endMs = Date.parse(w.endIso);
      return now >= startMs && now < endMs;
    });
    if (activeWindow && typeof activeWindow.ratePerHourMinor === "number") {
      const ratePerMinuteMinor = Math.round(activeWindow.ratePerHourMinor / 60);
      const microPerSecond = Math.round((activeWindow.ratePerHourMinor * 1_000_000) / 3600);
      return {
        ratePerMinuteMinor,
        microPerSecond,
        sourceRule: "event_window",
        effectiveFrom: activeWindow.startIso,
        effectiveUntil: activeWindow.endIso,
        version,
      };
    }
  }

  // 1b. Episode Override
  if (context.episodeId && config.episodeRatesPerMinuteMinor?.[context.episodeId] !== undefined) {
    const rate = config.episodeRatesPerMinuteMinor[context.episodeId];
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "episode_override",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
    };
  }

  // 2. Title rate
  if (context.assetId && config.titleRatesPerMinuteMinor?.[context.assetId] !== undefined) {
    const rate = config.titleRatesPerMinuteMinor[context.assetId];
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "title_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
    };
  }

  // 3. Series rate
  if (context.seriesId && config.seriesRatesPerMinuteMinor?.[context.seriesId] !== undefined) {
    const rate = config.seriesRatesPerMinuteMinor[context.seriesId];
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "series_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
    };
  }

  // 4. Channel rate (entered in ratePerHourMinor)
  if (context.channelId && config.channelRatesPerHourMinor?.[context.channelId] !== undefined) {
    const hourly = config.channelRatesPerHourMinor[context.channelId];
    const ratePerMinuteMinor = Math.round(hourly / 60);
    const microPerSecond = Math.round((hourly * 1_000_000) / 3600);
    return {
      ratePerMinuteMinor,
      microPerSecond,
      sourceRule: "channel_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
    };
  }

  // 5. Category rate
  if (context.categoryId && config.categoryRatesMinor?.[context.categoryId] !== undefined) {
    const rate = config.categoryRatesMinor[context.categoryId];
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "category_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
    };
  }

  // 6. Platform default
  const defaultRate =
    context.platformDefaultMinor ?? config.defaultRatePerMinuteMinor ?? 200;
  return {
    ratePerMinuteMinor: defaultRate,
    microPerSecond: Math.round((defaultRate * 1_000_000) / 60),
    sourceRule: "platform_default",
    effectiveFrom: baseEffectiveFrom,
    effectiveUntil: null,
    version,
  };
}

export function requireMinorUnitAmount(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new ApiError(
      400,
      "INVALID_PRICE",
      `${fieldName} must be a non-negative integer in minor currency units.`,
    );
  }
  return value;
}
