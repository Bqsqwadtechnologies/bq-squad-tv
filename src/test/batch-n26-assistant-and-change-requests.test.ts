import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_ASSISTANT_ACTIONS,
  isAssistantActionForbidden,
  assertAssistantActionAllowed,
  validateAssistantPreparedFix,
} from "@/lib/server/assistant-deny-list";
import {
  maskSecrets,
  targetPathForChange,
  validateChangeRequestPayload,
} from "@/lib/server/change-requests";
import {
  computeCountryRatePerMinute,
  resolveViewerCountryRate,
  DEFAULT_BASE_PRICE_USD_MINOR,
  getDefaultPricingConfig,
} from "@/lib/server/pricing";

describe("Rule A4 & Batch N26: Assistant Deny List & Boundaries", () => {
  it("prohibits all forbidden actions for assistants", () => {
    for (const action of FORBIDDEN_ASSISTANT_ACTIONS) {
      expect(isAssistantActionForbidden(action)).toBe(true);
      expect(() => assertAssistantActionAllowed(action)).toThrow(/forbidden under Rule A4/);
    }
  });

  it("prohibits sensitive variations and sub-strings", () => {
    expect(isAssistantActionForbidden("change_price_now")).toBe(true);
    expect(isAssistantActionForbidden("GO_LIVE_IMMEDIATELY")).toBe(true);
    expect(isAssistantActionForbidden("create-channel-for-me")).toBe(true);
    expect(isAssistantActionForbidden("bypass_pin_code")).toBe(true);
  });

  it("allows safe assistant actions like diagnostics and drafting", () => {
    expect(isAssistantActionForbidden("diagnose_hls_stream")).toBe(false);
    expect(isAssistantActionForbidden("suggest_metadata")).toBe(false);
    expect(isAssistantActionForbidden("generate_tag_recommendations")).toBe(false);
  });

  it("validates assistant prepared fixes and rejects changes to protected fields", () => {
    // Rejects revenue share alteration
    expect(() =>
      validateAssistantPreparedFix({
        targetType: "channel",
        targetId: "ch_123",
        proposedChanges: { revenueShare: 90 },
        explanation: "Increasing revenue share",
      }),
    ).toThrow(/Assistants may not modify protected field/);

    // Rejects role alteration
    expect(() =>
      validateAssistantPreparedFix({
        targetType: "channel",
        targetId: "ch_123",
        proposedChanges: { role: "owner" },
        explanation: "Promoting role",
      }),
    ).toThrow(/Assistants may not modify protected field/);

    // Allows safe metadata fix
    const result = validateAssistantPreparedFix({
      targetType: "title",
      targetId: "asset_999",
      proposedChanges: { title: "Corrected Title", description: "Safe description" },
      explanation: "Fixing spelling error in title",
    });
    expect(result.valid).toBe(true);
    expect(result.requiresChangeRequest).toBe(true);
    expect(result.sanitizedChanges.title).toBe("Corrected Title");
  });
});

describe("Batch N26: Change Request Lifecycle & Secrets Masking", () => {
  it("masks secrets in before/after change request snapshots", () => {
    const raw = {
      channelTitle: "BqSquad Prime",
      streamUrl: "https://stream.example.com/live.m3u8",
      streamKey: "secret_live_key_987654",
      apiToken: "tok_super_secret",
      nested: {
        password: "my_db_password",
        publicName: "Public Studio",
      },
    };

    const masked = maskSecrets(raw);
    expect(masked.channelTitle).toBe("BqSquad Prime");
    expect(masked.streamKey).toBe("••••••••");
    expect(masked.apiToken).toBe("••••••••");
    expect((masked.nested as any).password).toBe("••••••••");
    expect((masked.nested as any).publicName).toBe("Public Studio");
  });

  it("resolves valid target document paths for change request scopes", () => {
    expect(targetPathForChange("channel_details", "ch_1")).toBe("channels/ch_1");
    expect(targetPathForChange("stream_config", "str_2")).toBe("live_streams/str_2");
    expect(targetPathForChange("producer_title", "title_3")).toBe("content_assets/title_3");
  });

  it("validates change request scope and payload requirements", () => {
    expect(() =>
      validateChangeRequestPayload({
        scope: "channel_details",
        targetType: "channel",
        targetId: "",
        before: {},
        after: {},
      }),
    ).toThrow();
  });
});

describe("Rule N6: Country-Specific Pricing & Exchange Rates", () => {
  it("uses standard USD base price default of 5 minor cents ($0.05 / min)", () => {
    expect(DEFAULT_BASE_PRICE_USD_MINOR).toBe(5);
  });

  it("converts USD rate to NGN using exchange rates and country multiplier", () => {
    const res = computeCountryRatePerMinute(
      5, // $0.05
      {
        countryCode: "NG",
        currency: "NGN",
        mode: "automatic",
        multiplier: 1.0,
      },
      { NGN: 1500 }, // 1 USD = 1,500 NGN
    );

    expect(res.currency).toBe("NGN");
    // $0.05 * 1,500 = 75 NGN -> 75 minor kobo
    expect(res.ratePerMinuteMinor).toBe(7500); // 75 NGN in kobo (minor units)
  });

  it("applies fixed price mode when country rule defines fixedRatePerMinuteMinor", () => {
    const res = computeCountryRatePerMinute(
      5,
      {
        countryCode: "GH",
        currency: "GHS",
        mode: "fixed",
        fixedRatePerMinuteMinor: 80, // 0.80 GHS
      },
    );

    expect(res.currency).toBe("GHS");
    expect(res.ratePerMinuteMinor).toBe(80);
  });

  it("applies percentage adjustments and rounding rules", () => {
    const res = computeCountryRatePerMinute(
      5,
      {
        countryCode: "ZA",
        currency: "ZAR",
        mode: "percent_adjustment",
        adjustmentPercent: -20, // 20% discount
        roundingRule: "price_point_99",
      },
      { ZAR: 18 },
    );

    expect(res.currency).toBe("ZAR");
    // $0.05 * 18 = 0.90 -> 90 minor units. -20% = 72 units. Rounded to price_point_99 = 99
    expect(res.ratePerMinuteMinor).toBe(99);
  });

  it("resolves viewer rate with country-aware fallback to USD", () => {
    const config = getDefaultPricingConfig();
    const rateUs = resolveViewerCountryRate(
      "US",
      {},
      config,
    );
    expect(rateUs.currency).toBe("USD");
    expect(rateUs.ratePerMinuteMinor).toBe(5);

    const rateUnknown = resolveViewerCountryRate(
      "XX",
      {},
      config,
    );
    expect(rateUnknown.currency).toBe("USD");
    expect(rateUnknown.ratePerMinuteMinor).toBe(5);
  });
});
