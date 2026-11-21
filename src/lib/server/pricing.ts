import { ApiError, type Firestore } from "./firebase-admin";

export type RateSourceRule =
  | "promo_window"
  | "event_window"
  | "episode_override"
  | "title_rate"
  | "series_rate"
  | "live_stream_rate"
  | "channel_rate"
  | "category_rate"
  | "bundle"
  | "platform_default";

export type ResolvedRate = {
  ratePerMinuteMinor: number;
  microPerSecond: number; // ratePerMinuteMinor * 1_000_000 / 60
  sourceRule: RateSourceRule;
  effectiveFrom: string;
  effectiveUntil: string | null;
  version: number;
  isFree: boolean;
  promoLabel?: string;
};

export type PricingResolutionContext = {
  now?: number; // epoch ms
  channelId?: string | null;
  assetId?: string | null;
  seriesId?: string | null;
  episodeId?: string | null;
  categoryId?: string | null;
  liveStreamId?: string | null;
  platformDefaultMinor?: number;
  currency?: string;
};

export type EventWindow = {
  id: string;
  channelId: string;
  startIso: string;
  endIso: string;
  ratePerHourMinor: number;
  title?: string;
};

export type PromoPricingWindow = {
  id: string;
  targetType: "movie" | "series" | "episode" | "channel" | "live_stream" | "category" | "global";
  targetId?: string;
  overrideRateMinor?: number; // Can be 0 for 100% free promo
  discountPercent?: number; // 1-100
  startIso: string;
  endIso: string;
  label: string;
  active: boolean;
};

export type ContentBundle = {
  id: string;
  title: string;
  description: string;
  assetIds: string[];
  priceMinor: number;
  currency: string;
  durationDays: number;
  active: boolean;
};

export type PricingConfig = {
  version: number;
  defaultRatePerMinuteMinor: number;
  minimumSessionBalanceByCurrency?: Record<string, number>;
  minimumSessionBalanceMinor?: number;
  dailySpendLimitByCurrency?: Record<string, number>;
  producerShareBpsByChannel?: Record<string, number>;
  defaultProducerShareBps?: number;
  maxConcurrentSessions?: number;
  walletTopupsByCurrency?: Record<string, Record<string, unknown>>;
  walletTopups?: Record<string, unknown>;
  categoryRatesMinor?: Record<string, number>;
  channelRatesPerHourMinor?: Record<string, number>;
  seriesRatesPerMinuteMinor?: Record<string, number>;
  titleRatesPerMinuteMinor?: Record<string, number>;
  episodeRatesPerMinuteMinor?: Record<string, number>;
  liveStreamRatesPerMinuteMinor?: Record<string, number>;
  
  // Multicurrency maps
  channelRatesById?: Record<string, Record<string, number>>;
  assetRatesById?: Record<string, Record<string, number>>;
  seriesRatesById?: Record<string, Record<string, number>>;
  episodeRatesById?: Record<string, Record<string, number>>;
  categoryRatesById?: Record<string, Record<string, number>>;
  liveStreamRatesById?: Record<string, Record<string, number>>;
  defaultRatePerMinuteByCurrency?: Record<string, number>;
  
  eventWindows?: EventWindow[];
  promoPricingWindows?: PromoPricingWindow[];
  bundles?: ContentBundle[];
  
  effectiveDate?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export async function getPricingConfig(fs: Firestore): Promise<PricingConfig> {
  const config = await fs.getDoc("config/pricing");
  if (!config) {
    return {
      version: 1,
      defaultRatePerMinuteMinor: 200, // NGN default 2.00 NGN/min
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
 * Pure rate resolver implementing owner pricing hierarchy:
 * 1. Active Promotional Pricing Window (highest priority - discount or free override)
 * 2. Active Channel Programme / Event Window (live)
 * 3. Episode Override
 * 4. Title / Movie Rate (VOD)
 * 5. Series Rate
 * 6. Live Stream Rate
 * 7. Channel Default Rate (hourly / 60)
 * 8. Category Default Rate
 * 9. Platform Default Rate
 *
 * Supports free playback (0 minor units) across all levels.
 */
export function resolveRate(
  config: PricingConfig,
  context: PricingResolutionContext,
): ResolvedRate {
  const now = context.now ?? Date.now();
  const version = config.version || 1;
  const baseEffectiveFrom = config.effectiveDate || new Date(0).toISOString();
  const cur = context.currency ?? "NGN";

  // Helper to extract currency rate or direct rate
  function getRate(
    multicurrencyMap?: Record<string, Record<string, number>>,
    directMap?: Record<string, number>,
    key?: string | null,
  ): number | undefined {
    if (!key) return undefined;
    if (multicurrencyMap?.[key]?.[cur] !== undefined) {
      return multicurrencyMap[key][cur];
    }
    if (directMap?.[key] !== undefined) {
      return directMap[key];
    }
    return undefined;
  }

  // 1. Promotional Window
  if (config.promoPricingWindows && Array.isArray(config.promoPricingWindows)) {
    const activePromo = config.promoPricingWindows.find((p) => {
      if (!p.active) return false;
      const startMs = Date.parse(p.startIso);
      const endMs = Date.parse(p.endIso);
      if (now < startMs || now >= endMs) return false;
      
      if (p.targetType === "global") return true;
      if (p.targetType === "movie" && p.targetId === context.assetId) return true;
      if (p.targetType === "episode" && p.targetId === context.episodeId) return true;
      if (p.targetType === "series" && p.targetId === context.seriesId) return true;
      if (p.targetType === "channel" && p.targetId === context.channelId) return true;
      if (p.targetType === "live_stream" && p.targetId === context.liveStreamId) return true;
      if (p.targetType === "category" && p.targetId === context.categoryId) return true;
      return false;
    });

    if (activePromo) {
      if (activePromo.overrideRateMinor !== undefined) {
        const rate = Math.max(0, activePromo.overrideRateMinor);
        return {
          ratePerMinuteMinor: rate,
          microPerSecond: Math.round((rate * 1_000_000) / 60),
          sourceRule: "promo_window",
          effectiveFrom: activePromo.startIso,
          effectiveUntil: activePromo.endIso,
          version,
          isFree: rate === 0,
          promoLabel: activePromo.label,
        };
      }
    }
  }

  // 2. Channel Event/Programme Time Window
  if (context.channelId && config.eventWindows && Array.isArray(config.eventWindows)) {
    const activeWindow = config.eventWindows.find((w) => {
      if (w.channelId !== context.channelId) return false;
      const startMs = Date.parse(w.startIso);
      const endMs = Date.parse(w.endIso);
      return now >= startMs && now < endMs;
    });
    if (activeWindow && typeof activeWindow.ratePerHourMinor === "number") {
      const ratePerMinuteMinor = Math.max(0, Math.round(activeWindow.ratePerHourMinor / 60));
      const microPerSecond = Math.round((activeWindow.ratePerHourMinor * 1_000_000) / 3600);
      return {
        ratePerMinuteMinor,
        microPerSecond,
        sourceRule: "event_window",
        effectiveFrom: activeWindow.startIso,
        effectiveUntil: activeWindow.endIso,
        version,
        isFree: ratePerMinuteMinor === 0,
      };
    }
  }

  // 3. Episode Override
  const epRate = getRate(config.episodeRatesById, config.episodeRatesPerMinuteMinor, context.episodeId);
  if (epRate !== undefined) {
    const rate = Math.max(0, epRate);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "episode_override",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
    };
  }

  // 4. Title / Movie rate
  const titleRate = getRate(config.assetRatesById, config.titleRatesPerMinuteMinor, context.assetId);
  if (titleRate !== undefined) {
    const rate = Math.max(0, titleRate);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "title_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
    };
  }

  // 5. Series rate
  const serRate = getRate(config.seriesRatesById, config.seriesRatesPerMinuteMinor, context.seriesId);
  if (serRate !== undefined) {
    const rate = Math.max(0, serRate);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "series_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
    };
  }

  // 6. Live Stream rate
  const liveRate = getRate(config.liveStreamRatesById, config.liveStreamRatesPerMinuteMinor, context.liveStreamId);
  if (liveRate !== undefined) {
    const rate = Math.max(0, liveRate);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "live_stream_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
    };
  }

  // 7. Channel rate (hourly / 60)
  const chanRate = getRate(config.channelRatesById, config.channelRatesPerHourMinor, context.channelId);
  if (chanRate !== undefined) {
    const ratePerMinuteMinor = Math.max(0, Math.round(chanRate / 60));
    const microPerSecond = Math.round((chanRate * 1_000_000) / 3600);
    return {
      ratePerMinuteMinor,
      microPerSecond,
      sourceRule: "channel_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: ratePerMinuteMinor === 0,
    };
  }

  // 8. Category rate
  const catRate = getRate(config.categoryRatesById, config.categoryRatesMinor, context.categoryId);
  if (catRate !== undefined) {
    const rate = Math.max(0, catRate);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "category_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
    };
  }

  // 9. Platform default
  const curDefault = config.defaultRatePerMinuteByCurrency?.[cur];
  const defaultRate = Math.max(
    0,
    context.platformDefaultMinor ?? curDefault ?? config.defaultRatePerMinuteMinor ?? 200,
  );
  return {
    ratePerMinuteMinor: defaultRate,
    microPerSecond: Math.round((defaultRate * 1_000_000) / 60),
    sourceRule: "platform_default",
    effectiveFrom: baseEffectiveFrom,
    effectiveUntil: null,
    version,
    isFree: defaultRate === 0,
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
