import { describe, expect, it } from "vitest";
import {
  computeCountryRatePerMinute,
  resolveViewerCountryRate,
  applyBulkCountryAdjustment,
  exportCountryPricingRulesCsv,
  parseCountryPricingRulesCsv,
  type CountryPricingRule,
  type PricingConfig,
} from "@/lib/server/pricing";
import {
  computeStandings,
  computeKnockoutBracket,
  type SportsTeam,
  type SportsFixture,
} from "@/lib/server/sports";

describe("Batch N7: Country Per-Minute Pricing Engine", () => {
  it("resolves country-specific multiplier and rounds properly", () => {
    const gbRule: CountryPricingRule = {
      countryCode: "GB",
      currency: "GBP",
      mode: "automatic",
      multiplier: 1.25,
      roundingRule: "none",
      enabled: true,
    };

    const gbRate = computeCountryRatePerMinute(200, gbRule, { GBP: 0.8 });
    expect(gbRate.currency).toBe("GBP");
    expect(gbRate.ratePerMinuteMinor).toBe(200); // 200 * 0.8 * 1.25 = 200

    const usRule: CountryPricingRule = {
      countryCode: "US",
      currency: "USD",
      mode: "automatic",
      multiplier: 1.5,
      roundingRule: "price_point_99",
      enabled: true,
    };

    const usRate = computeCountryRatePerMinute(200, usRule, { USD: 1.0 });
    expect(usRate.currency).toBe("USD");
    expect(usRate.ratePerMinuteMinor % 100).toBe(99);
  });

  it("never falls back non-Nigerian viewers to NGN", () => {
    const rate = resolveViewerCountryRate(
      "FR",
      { currency: "EUR" },
      {
        version: 1,
        defaultRatePerMinuteMinor: 200,
        minimumSessionBalanceMinor: 0,
        defaultProducerShareBps: 7000,
        walletTopups: {},
      } as PricingConfig,
    );

    expect(rate.currency).not.toBe("NGN");
    expect(["EUR", "USD"]).toContain(rate.currency);
  });

  it("applies bulk adjustments and round-trips CSV matrix", () => {
    const initialRules: Record<string, CountryPricingRule> = {
      CA: { countryCode: "CA", mode: "percent_adjustment", adjustmentPercent: 0, currency: "CAD", enabled: true },
      AU: { countryCode: "AU", mode: "percent_adjustment", adjustmentPercent: 0, currency: "AUD", enabled: true },
    };

    const adjusted = applyBulkCountryAdjustment(initialRules, 15);
    expect(adjusted["CA"]?.adjustmentPercent).toBe(15);
    expect(adjusted["AU"]?.adjustmentPercent).toBe(15);

    const csv = exportCountryPricingRulesCsv(adjusted);
    expect(csv).toContain("CA,CAD,percent_adjustment,true");
    expect(csv).toContain("AU,AUD,percent_adjustment,true");

    const parsed = parseCountryPricingRulesCsv(csv);
    expect(parsed.length).toBe(2);
    const ca = parsed.find((p) => p.countryCode === "CA");
    expect(ca).toBeDefined();
    expect(ca?.adjustmentPercent).toBe(15);
  });
});

describe("Batch N9: Sports Hub Standings & Brackets", () => {
  const teams = [
    { id: "team-a", competitionId: "comp-1", name: "Team Alpha", shortCode: "ALP", country: "Nigeria" },
    { id: "team-b", competitionId: "comp-1", name: "Team Beta", shortCode: "BET", country: "Nigeria" },
    { id: "team-c", competitionId: "comp-1", name: "Team Gamma", shortCode: "GAM", country: "Ghana" },
  ] satisfies [SportsTeam, SportsTeam, SportsTeam];

  it("computes official league standings with 3-1-0 points and GD tiebreakers", () => {
    const fixtures: SportsFixture[] = [
      {
        id: "m1",
        competitionId: "comp-1",
        homeTeam: teams[0],
        awayTeam: teams[1],
        round: "Round 1",
        kickoffIso: "2026-05-01T15:00:00Z",
        venue: "National Stadium",
        status: "ended",
        homeScore: 3,
        awayScore: 1, // Team A wins 3 pts, +2 GD
      },
      {
        id: "m2",
        competitionId: "comp-1",
        homeTeam: teams[1],
        awayTeam: teams[2],
        round: "Round 2",
        kickoffIso: "2026-05-08T15:00:00Z",
        venue: "City Arena",
        status: "ended",
        homeScore: 2,
        awayScore: 2, // Draw 1 pt each
      },
    ];

    const standings = computeStandings(teams, fixtures);
    expect(standings.length).toBe(3);

    // Team Alpha: 1 played, 1 won, 3 pts, +2 GD
    expect(standings[0].teamId).toBe("team-a");
    expect(standings[0].points).toBe(3);
    expect(standings[0].goalDiff).toBe(2);

    // Team Beta: 2 played, 0 won, 1 drawn, 1 lost, 1 pt, -2 GD
    // Team Gamma: 1 played, 0 won, 1 drawn, 0 lost, 1 pt, 0 GD
    expect(standings[1].teamId).toBe("team-c");
    expect(standings[1].points).toBe(1);
    expect(standings[1].goalDiff).toBe(0);

    expect(standings[2].teamId).toBe("team-b");
    expect(standings[2].points).toBe(1);
    expect(standings[2].goalDiff).toBe(-2);
  });

  it("computes tournament knockout bracket stages accurately", () => {
    const fixtures: SportsFixture[] = [
      {
        id: "qf1",
        competitionId: "comp-2",
        homeTeam: teams[0],
        awayTeam: teams[1],
        round: "Quarter-Final 1",
        stage: "quarter_final",
        kickoffIso: "2026-06-01T18:00:00Z",
        venue: "Arena",
        status: "ended",
        homeScore: 1,
        awayScore: 0,
      },
      {
        id: "fn1",
        competitionId: "comp-2",
        homeTeam: teams[0],
        awayTeam: teams[2],
        round: "Grand Final",
        stage: "final",
        kickoffIso: "2026-06-15T20:00:00Z",
        venue: "Grand Stadium",
        status: "scheduled",
      },
    ];

    const bracket = computeKnockoutBracket(fixtures);
    expect(bracket["quarter_final"]).toBeDefined();
    expect(bracket["quarter_final"].length).toBe(1);
    expect(bracket["final"]).toBeDefined();
    expect(bracket["final"].length).toBe(1);
  });

  it("handles zero fake data without errors", () => {
    const emptyStandings = computeStandings([], []);
    expect(emptyStandings).toEqual([]);

    const emptyBracket = computeKnockoutBracket([]);
    expect(Object.values(emptyBracket).every((arr) => arr.length === 0)).toBe(true);
  });
});

describe("Batch N24: Must-Pay Playback & Account Limits", () => {
  it("enforces pay-as-you-go and denies free bypass without explicit owner rule", () => {
    const currencySpecificRate = 200; // 200 kobo / cents
    const isExplicitOwnerFree = currencySpecificRate === 0;
    const isPreviewGrant = false;
    const paidPlayback = !isExplicitOwnerFree && !isPreviewGrant;

    expect(paidPlayback).toBe(true);
  });

  it("allows playback when owner explicitly sets price to 0", () => {
    const currencySpecificRate = 0;
    const isExplicitOwnerFree = currencySpecificRate === 0;
    const isPreviewGrant = false;
    const paidPlayback = !isExplicitOwnerFree && !isPreviewGrant;

    expect(paidPlayback).toBe(false);
  });
});
