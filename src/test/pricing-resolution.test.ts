import { describe, it, expect } from "vitest";
import { resolveRate, type PricingConfig } from "@/lib/server/pricing";

describe("Pricing Precedence & resolveRate() (Prompt 3 B2)", () => {
  const baseConfig: PricingConfig = {
    version: 3,
    defaultRatePerMinuteMinor: 200, // ₦2.00 / min default
    categoryRatesMinor: {
      action: 300,
      drama: 250,
    },
    channelRatesPerHourMinor: {
      "channel-sport": 12_000, // ₦120.00 / hr -> 200 minor/min
      "channel-news": 6_000,   // ₦60.00 / hr -> 100 minor/min
    },
    seriesRatesPerMinuteMinor: {
      "series-apex": 400,
    },
    titleRatesPerMinuteMinor: {
      "movie-blockbuster": 500,
    },
    episodeRatesPerMinuteMinor: {
      "episode-finale": 700,
    },
    eventWindows: [
      {
        id: "event-derby",
        channelId: "channel-sport",
        startIso: "2026-11-20T18:00:00.000Z",
        endIso: "2026-11-20T20:00:00.000Z",
        ratePerHourMinor: 60_000, // ₦600/hr during match -> 1000 minor/min
        title: "Championship Derby Match",
      },
    ],
  };

  it("1a. returns active event window rate during event window", () => {
    const duringDerby = Date.parse("2026-11-20T18:30:00.000Z");
    const rate = resolveRate(baseConfig, {
      channelId: "channel-sport",
      now: duringDerby,
    });
    expect(rate.sourceRule).toBe("event_window");
    expect(rate.ratePerMinuteMinor).toBe(1000);
    expect(rate.version).toBe(3);
    expect(rate.effectiveUntil).toBe("2026-11-20T20:00:00.000Z");
  });

  it("1b. falls back to channel default outside event window", () => {
    const afterDerby = Date.parse("2026-11-20T20:05:00.000Z");
    const rate = resolveRate(baseConfig, {
      channelId: "channel-sport",
      now: afterDerby,
    });
    expect(rate.sourceRule).toBe("channel_rate");
    expect(rate.ratePerMinuteMinor).toBe(200); // 12000 / 60
    expect(rate.effectiveUntil).toBeNull();
  });

  it("1c. episode override beats series and default rates", () => {
    const rate = resolveRate(baseConfig, {
      seriesId: "series-apex",
      episodeId: "episode-finale",
      categoryId: "action",
    });
    expect(rate.sourceRule).toBe("episode_override");
    expect(rate.ratePerMinuteMinor).toBe(700);
  });

  it("2. title rate beats category and platform default", () => {
    const rate = resolveRate(baseConfig, {
      assetId: "movie-blockbuster",
      categoryId: "action",
    });
    expect(rate.sourceRule).toBe("title_rate");
    expect(rate.ratePerMinuteMinor).toBe(500);
  });

  it("3. series rate beats category rate", () => {
    const rate = resolveRate(baseConfig, {
      seriesId: "series-apex",
      categoryId: "action",
    });
    expect(rate.sourceRule).toBe("series_rate");
    expect(rate.ratePerMinuteMinor).toBe(400);
  });

  it("5. category rate beats platform default", () => {
    const rate = resolveRate(baseConfig, {
      categoryId: "action",
    });
    expect(rate.sourceRule).toBe("category_rate");
    expect(rate.ratePerMinuteMinor).toBe(300);
  });

  it("6. platform default when no specific rates match", () => {
    const rate = resolveRate(baseConfig, {});
    expect(rate.sourceRule).toBe("platform_default");
    expect(rate.ratePerMinuteMinor).toBe(200);
  });
});
