import { ApiError, type Firestore } from "./firebase-admin";
import { currencyForCountry, normalizeCountryCode } from "./currency";

export type RateSourceRule =
  | "promo_window"
  | "event_window"
  | "episode_override"
  | "title_country_rate"
  | "title_rate"
  | "title_base_country_rate"
  | "country_rule"
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
  currency?: string;
  countryCode?: string;
};

export type PricingResolutionContext = {
  now?: number; // epoch ms
  countryCode?: string | null;
  channelId?: string | null;
  assetId?: string | null;
  seriesId?: string | null;
  episodeId?: string | null;
  categoryId?: string | null;
  liveStreamId?: string | null;
  platformDefaultMinor?: number;
  currency?: string;
  titleCountryRates?: Record<string, number>;
  titleBasePriceUsdMinor?: number;
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

export type CountryPricingMode = "automatic" | "percent_adjustment" | "fixed";
export type CountryRoundingRule = "none" | "nearest_10" | "nearest_50" | "price_point_99";

export type CountryPricingRule = {
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "US", "GB", "NG"
  currency: string; // ISO 4217, e.g. "USD", "GBP", "NGN"
  mode: CountryPricingMode;
  enabled: boolean;
  multiplier?: number; // default 1.0 for automatic
  adjustmentPercent?: number; // e.g. +10 or -10 for percent_adjustment
  fixedRatePerMinuteMinor?: number; // for fixed mode
  exchangeRateToUsd?: number; // 1 USD = X local currency units
  minimumRateMinor?: number;
  maximumRateMinor?: number;
  roundingRule?: CountryRoundingRule;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  updatedBy?: string;
  updatedAt?: string;
};

export const DEFAULT_BASE_PRICE_USD_MINOR = 5; // $0.05 / min in USD minor units (5 cents)

export const DEFAULT_EXCHANGE_RATES: Readonly<Record<string, number>> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  NGN: 1550.0,
  GHS: 15.2,
  KES: 130.0,
  ZAR: 18.5,
  INR: 83.5,
  JPY: 155.0,
  XOF: 605.0,
  XAF: 605.0,
  BRL: 5.4,
  MXN: 18.2,
};

export type PricingConfig = {
  version: number;
  defaultRatePerMinuteMinor: number;
  basePricePerMinuteUsdMinor?: number;
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

  // Batch N7 Country Pricing Engine
  countryRules?: Record<string, CountryPricingRule>;
  exchangeRates?: Record<string, number>;

  eventWindows?: EventWindow[];
  promoPricingWindows?: PromoPricingWindow[];
  bundles?: ContentBundle[];

  effectiveDate?: string;
  updatedAt?: string;
  updatedBy?: string;
};

export function getDefaultPricingConfig(): PricingConfig {
  return {
    version: 1,
    defaultRatePerMinuteMinor: 200,
    basePricePerMinuteUsdMinor: DEFAULT_BASE_PRICE_USD_MINOR,
    currencyRates: {
      USD: 5,
      GBP: 4,
      EUR: 5,
      NGN: 200,
    },
    exchangeRates: DEFAULT_EXCHANGE_RATES,
    countryRules: {},
  };
}

export async function getPricingConfig(fs: Firestore): Promise<PricingConfig> {
  const config = await fs.getDoc("config/pricing");
  if (!config) {
    return {
      version: 1,
      defaultRatePerMinuteMinor: 200,
      basePricePerMinuteUsdMinor: DEFAULT_BASE_PRICE_USD_MINOR,
    };
  }
  const version = typeof config["version"] === "number" ? config["version"] : 1;
  const defaultRatePerMinuteMinor =
    typeof config["defaultRatePerMinuteMinor"] === "number"
      ? config["defaultRatePerMinuteMinor"]
      : 200;
  const basePricePerMinuteUsdMinor =
    typeof config["basePricePerMinuteUsdMinor"] === "number"
      ? config["basePricePerMinuteUsdMinor"]
      : DEFAULT_BASE_PRICE_USD_MINOR;

  return {
    ...config,
    version,
    defaultRatePerMinuteMinor,
    basePricePerMinuteUsdMinor,
  } as PricingConfig;
}

export function applyRoundingRule(amountMinor: number, rule?: CountryRoundingRule): number {
  if (!rule || rule === "none") return Math.round(amountMinor);
  if (rule === "nearest_10") return Math.max(0, Math.round(amountMinor / 10) * 10);
  if (rule === "nearest_50") return Math.max(0, Math.round(amountMinor / 50) * 50);
  if (rule === "price_point_99") {
    if (amountMinor < 100) return 99;
    return Math.max(99, Math.floor(amountMinor / 100) * 100 + 99);
  }
  return Math.round(amountMinor);
}

export function computeCountryRatePerMinute(
  basePriceUsdMinor: number,
  rule: CountryPricingRule,
  exchangeRates: Record<string, number> = DEFAULT_EXCHANGE_RATES,
): {
  ratePerMinuteMinor: number;
  per90MinFilmMinor: number;
  currency: string;
} {
  const currency = rule.currency || currencyForCountry(rule.countryCode);
  let rate: number;

  if (rule.mode === "fixed") {
    rate = rule.fixedRatePerMinuteMinor ?? 0;
  } else {
    const rateToUsd =
      rule.exchangeRateToUsd ??
      exchangeRates[currency] ??
      DEFAULT_EXCHANGE_RATES[currency] ??
      1.0;

    let computed = basePriceUsdMinor * rateToUsd;

    if (rule.mode === "automatic") {
      const multiplier = rule.multiplier ?? 1.0;
      computed = computed * multiplier;
    } else if (rule.mode === "percent_adjustment") {
      const pct = rule.adjustmentPercent ?? 0;
      computed = computed * (1 + pct / 100);
    }

    rate = applyRoundingRule(computed, rule.roundingRule);
  }

  if (typeof rule.minimumRateMinor === "number") {
    rate = Math.max(rule.minimumRateMinor, rate);
  }
  if (typeof rule.maximumRateMinor === "number") {
    rate = Math.min(rule.maximumRateMinor, rate);
  }

  const ratePerMinuteMinor = Math.max(0, Math.round(rate));
  const per90MinFilmMinor = ratePerMinuteMinor * 90;

  return {
    ratePerMinuteMinor,
    per90MinFilmMinor,
    currency,
  };
}

/**
 * Batch N7 viewer country rate resolver.
 * Resolution order for a viewer:
 * 1. Title price for that country
 * 2. Title base (USD) * country rule
 * 3. Global country rule
 * 4. Default currency rate or converted base USD rate
 *
 * CRITICAL RULE (Batch N7):
 * Missing rate raises an owner alert / log, and NEVER falls back to naira
 * for non-Nigerian viewers.
 */
export function resolveViewerCountryRate(
  countryCodeRaw: string,
  context: PricingResolutionContext,
  config: PricingConfig,
): ResolvedRate {
  const countryCode = normalizeCountryCode(countryCodeRaw) || "US";
  const currency = context.currency || currencyForCountry(countryCode);
  const now = context.now ?? Date.now();
  const version = config.version || 1;
  const baseEffectiveFrom = config.effectiveDate || new Date(0).toISOString();
  const rates = { ...DEFAULT_EXCHANGE_RATES, ...(config.exchangeRates || {}) };

  // 1. Title price for that country
  if (context.titleCountryRates && context.titleCountryRates[countryCode] !== undefined) {
    const rate = Math.max(0, context.titleCountryRates[countryCode]);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "title_country_rate",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
      currency,
      countryCode,
    };
  }

  const countryRule = config.countryRules?.[countryCode];

  // 2. Title base price (USD) * country rule
  if (typeof context.titleBasePriceUsdMinor === "number" && context.titleBasePriceUsdMinor >= 0) {
    if (countryRule && countryRule.enabled !== false) {
      const computed = computeCountryRatePerMinute(context.titleBasePriceUsdMinor, countryRule, rates);
      return {
        ratePerMinuteMinor: computed.ratePerMinuteMinor,
        microPerSecond: Math.round((computed.ratePerMinuteMinor * 1_000_000) / 60),
        sourceRule: "title_base_country_rate",
        effectiveFrom: baseEffectiveFrom,
        effectiveUntil: null,
        version,
        isFree: computed.ratePerMinuteMinor === 0,
        currency: computed.currency,
        countryCode,
      };
    }
  }

  // 3. Global country rule
  if (countryRule && countryRule.enabled !== false) {
    const baseUsd = config.basePricePerMinuteUsdMinor ?? DEFAULT_BASE_PRICE_USD_MINOR;
    const computed = computeCountryRatePerMinute(baseUsd, countryRule, rates);
    return {
      ratePerMinuteMinor: computed.ratePerMinuteMinor,
      microPerSecond: Math.round((computed.ratePerMinuteMinor * 1_000_000) / 60),
      sourceRule: "country_rule",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: computed.ratePerMinuteMinor === 0,
      currency: computed.currency,
      countryCode,
    };
  }

  // 4. Fallback: Currency default rate or USD rate converted (NEVER NGN unless country is NG!)
  const curDefault = config.defaultRatePerMinuteByCurrency?.[currency];
  if (curDefault !== undefined) {
    const rate = Math.max(0, curDefault);
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "platform_default",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
      currency,
      countryCode,
    };
  }

  // Convert base USD rate to the viewer's currency
  const exchangeRate = rates[currency] ?? (currency === "USD" ? 1.0 : undefined);
  if (exchangeRate !== undefined) {
    const baseUsd = config.basePricePerMinuteUsdMinor ?? DEFAULT_BASE_PRICE_USD_MINOR;
    const rate = Math.max(0, Math.round(baseUsd * exchangeRate));
    return {
      ratePerMinuteMinor: rate,
      microPerSecond: Math.round((rate * 1_000_000) / 60),
      sourceRule: "platform_default",
      effectiveFrom: baseEffectiveFrom,
      effectiveUntil: null,
      version,
      isFree: rate === 0,
      currency,
      countryCode,
    };
  }

  // If currency rate is completely missing and country is NOT NG, charge in USD (NEVER fall back to NGN!)
  const safeCurrency = countryCode === "NG" ? "NGN" : "USD";
  const defaultRate = safeCurrency === "NGN" ? config.defaultRatePerMinuteMinor ?? 200 : config.basePricePerMinuteUsdMinor ?? DEFAULT_BASE_PRICE_USD_MINOR;

  return {
    ratePerMinuteMinor: defaultRate,
    microPerSecond: Math.round((defaultRate * 1_000_000) / 60),
    sourceRule: "platform_default",
    effectiveFrom: baseEffectiveFrom,
    effectiveUntil: null,
    version,
    isFree: defaultRate === 0,
    currency: safeCurrency,
    countryCode,
  };
}

/**
 * Pure rate resolver implementing owner pricing hierarchy:
 * 1. Active Promotional Pricing Window (highest priority - discount or free override)
 * 2. Active Channel Programme / Event Window (live)
 * 3. Country-specific rate (if countryCode provided)
 * 4. Episode Override
 * 5. Title / Movie Rate (VOD)
 * 6. Series Rate
 * 7. Live Stream Rate
 * 8. Channel Default Rate (hourly / 60)
 * 9. Category Default Rate
 * 10. Platform Default Rate
 */
export function resolveRate(
  config: PricingConfig,
  context: PricingResolutionContext,
): ResolvedRate {
  const now = context.now ?? Date.now();
  const version = config.version || 1;
  const baseEffectiveFrom = config.effectiveDate || new Date(0).toISOString();
  const cur = context.currency ?? (context.countryCode ? currencyForCountry(context.countryCode) : "USD");

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
          currency: cur,
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
        currency: cur,
      };
    }
  }

  // 3. Country-specific rule if countryCode is passed
  if (context.countryCode) {
    return resolveViewerCountryRate(context.countryCode, context, config);
  }

  // 4. Episode Override
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
      currency: cur,
    };
  }

  // 5. Title / Movie rate
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
      currency: cur,
    };
  }

  // 6. Series rate
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
      currency: cur,
    };
  }

  // 7. Live Stream rate
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
      currency: cur,
    };
  }

  // 8. Channel rate (hourly / 60)
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
      currency: cur,
    };
  }

  // 9. Category rate
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
      currency: cur,
    };
  }

  // 10. Platform default
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
    currency: cur,
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
