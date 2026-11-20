import { describe, expect, it } from "vitest";
import { resolveRate, type PricingConfig, type PromoPricingWindow } from "@/lib/server/pricing";

describe("Batch 7: Pricing Control & Multi-Tier Hierarchy", () => {
  const baseConfig: PricingConfig = {
    version: 4,
    defaultRatePerMinuteMinor: 200, // NGN 2.00/min
    defaultRatePerMinuteByCurrency: {
      NGN: 200,
      USD: 25,
    },
    categoryRatesById: {
      documentary: { NGN: 100, USD: 15 },
      news: { NGN: 0, USD: 0 }, // Free category
    },
    channelRatesById: {
      channel_premium: { NGN: 18000, USD: 2400 }, // 300 NGN/min, 40 USD cents/min
    },
    seriesRatesById: {
      series_blockbuster: { NGN: 350, USD: 45 },
    },
    assetRatesById: {
      movie_standalone: { NGN: 400, USD: 50 },
      movie_free: { NGN: 0, USD: 0 },
    },
    episodeRatesById: {
      episode_pilot_free: { NGN: 0, USD: 0 },
      episode_finale_premium: { NGN: 500, USD: 65 },
    },
    liveStreamRatesById: {
      live_derby: { NGN: 600, USD: 75 },
    },
    promoPricingWindows: [
      {
        id: "promo_weekend",
        targetType: "movie",
        targetId: "movie_standalone",
        overrideRateMinor: 100,
        startIso: "2026-11-20T00:00:00Z",
        endIso: "2026-11-23T23:59:59Z",
        label: "Weekend Flash Sale",
        active: true,
      },
      {
        id: "promo_free_derby",
        targetType: "live_stream",
        targetId: "live_derby",
        overrideRateMinor: 0, // Free promo
        startIso: "2026-11-20T12:00:00Z",
        endIso: "2026-11-20T14:00:00Z",
        label: "Community Free Derby Hour",
        active: true,
      },
    ],
  };

  it("resolves platform default when no specific overrides apply", () => {
    const rate = resolveRate(baseConfig, {
      assetId: "unknown_asset",
      currency: "NGN",
    });
    expect(rate.ratePerMinuteMinor).toBe(200);
    expect(rate.sourceRule).toBe("platform_default");
    expect(rate.isFree).toBe(false);

    const usdRate = resolveRate(baseConfig, {
      assetId: "unknown_asset",
      currency: "USD",
    });
    expect(usdRate.ratePerMinuteMinor).toBe(25);
    expect(usdRate.sourceRule).toBe("platform_default");
  });

  it("resolves category rate when defined", () => {
    const rate = resolveRate(baseConfig, {
      categoryId: "documentary",
      currency: "NGN",
    });
    expect(rate.ratePerMinuteMinor).toBe(100);
    expect(rate.sourceRule).toBe("category_rate");
    expect(rate.isFree).toBe(false);

    // Free category test
    const freeRate = resolveRate(baseConfig, {
      categoryId: "news",
      currency: "NGN",
    });
    expect(freeRate.ratePerMinuteMinor).toBe(0);
    expect(freeRate.sourceRule).toBe("category_rate");
    expect(freeRate.isFree).toBe(true);
  });

  it("resolves channel, series, and movie overrides in correct precedence hierarchy", () => {
    // Channel rate
    const chanRate = resolveRate(baseConfig, {
      channelId: "channel_premium",
      currency: "NGN",
    });
    expect(chanRate.ratePerMinuteMinor).toBe(300); // 18000 / 60
    expect(chanRate.sourceRule).toBe("channel_rate");

    // Series overrides channel
    const seriesRate = resolveRate(baseConfig, {
      channelId: "channel_premium",
      seriesId: "series_blockbuster",
      currency: "NGN",
    });
    expect(seriesRate.ratePerMinuteMinor).toBe(350);
    expect(seriesRate.sourceRule).toBe("series_rate");

    // Movie title overrides series and channel
    const movieRate = resolveRate(baseConfig, {
      channelId: "channel_premium",
      seriesId: "series_blockbuster",
      assetId: "movie_standalone",
      currency: "USD",
      now: Date.parse("2026-11-25T10:00:00Z"), // outside promo
    });
    expect(movieRate.ratePerMinuteMinor).toBe(50);
    expect(movieRate.sourceRule).toBe("title_rate");

    // Episode override beats series
    const episodePilot = resolveRate(baseConfig, {
      seriesId: "series_blockbuster",
      episodeId: "episode_pilot_free",
      currency: "NGN",
    });
    expect(episodePilot.ratePerMinuteMinor).toBe(0);
    expect(episodePilot.sourceRule).toBe("episode_override");
    expect(episodePilot.isFree).toBe(true);
  });

  it("resolves scheduled promotional pricing window when active and falls back when expired", () => {
    const duringPromoTime = Date.parse("2026-11-21T15:00:00Z");
    const afterPromoTime = Date.parse("2026-11-25T15:00:00Z");

    const promoActive = resolveRate(baseConfig, {
      assetId: "movie_standalone",
      currency: "NGN",
      now: duringPromoTime,
    });
    expect(promoActive.sourceRule).toBe("promo_window");
    expect(promoActive.ratePerMinuteMinor).toBe(100);
    expect(promoActive.promoLabel).toBe("Weekend Flash Sale");

    const promoExpired = resolveRate(baseConfig, {
      assetId: "movie_standalone",
      currency: "NGN",
      now: afterPromoTime,
    });
    expect(promoExpired.sourceRule).toBe("title_rate");
    expect(promoExpired.ratePerMinuteMinor).toBe(400);
  });

  it("resolves live stream rates and free live stream promotional windows", () => {
    const duringDerbyFree = Date.parse("2026-11-20T13:00:00Z");
    const afterDerbyFree = Date.parse("2026-11-20T15:00:00Z");

    const freeDerby = resolveRate(baseConfig, {
      liveStreamId: "live_derby",
      currency: "NGN",
      now: duringDerbyFree,
    });
    expect(freeDerby.sourceRule).toBe("promo_window");
    expect(freeDerby.ratePerMinuteMinor).toBe(0);
    expect(freeDerby.isFree).toBe(true);

    const regularDerby = resolveRate(baseConfig, {
      liveStreamId: "live_derby",
      currency: "NGN",
      now: afterDerbyFree,
    });
    expect(regularDerby.sourceRule).toBe("live_stream_rate");
    expect(regularDerby.ratePerMinuteMinor).toBe(600);
    expect(regularDerby.isFree).toBe(false);
  });
});
