import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock ConsolePageGuard to render children directly with mock token & account
vi.mock("@/components/ConsolePageGuard", () => ({
  ConsolePageGuard: ({ children }: any) =>
    typeof children === "function"
      ? children({
          token: "mock-token",
          account: {
            email: "producer@example.com",
            roles: ["producer"],
            isOwner: false,
          },
        })
      : children,
}));

// Mock fetch to provide summary, earnings, and analytics responses
global.fetch = vi.fn((url: any) => {
  if (url.includes("/api/public/v1/legal/status")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ acceptanceRequired: false, pages: [] }),
    });
  }
  if (url.includes("/api/public/v1/producer/mobile-summary")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          producerStatus: "ACTIVE",
          earningsBalanceMinor: 250000,
          earningsLifetimeMinor: 1200000,
          currency: "USD",
          channelCount: 2,
          publishedChannelCount: 2,
          channels: [{ id: "ch_prime", title: "Prime Cinema", status: "PUBLISHED" }],
        }),
    });
  }
  if (url.includes("/api/public/v1/producer/earnings")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          statement: [
            {
              id: "st_1",
              kind: "Monthly Ad Revenue",
              amountMinor: 50000,
              currency: "USD",
              createdAt: "2026-03-01T00:00:00Z",
            },
          ],
          payouts: [],
        }),
    });
  }
  if (url.includes("/api/public/v1/producer/analytics")) {
    return Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          period: "30d",
          totalMinutesWatched: 12400,
          totalWatchHours: 206.7,
          totalEarningsMinor: 250000,
          currency: "USD",
          sessionCount: 840,
          liveViewers: 42,
          series: [
            { label: "Day 1", views: 25, watchMinutes: 300, earningsMinor: 5000 },
            { label: "Day 2", views: 40, watchMinutes: 520, earningsMinor: 8000 },
          ],
          topContent: [
            {
              id: "asset_01",
              title: "Midnight Thriller Ep 1",
              status: "ACTIVE",
              views: 1200,
              watchHours: 45.2,
              revenueMinor: 85000,
              thumbnailUrl: "/brand/bq-sqwad-tv-logo.png",
            },
          ],
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
}) as any;

import { Route } from "@/routes/producer.index";

describe("Producer Dashboard (V5-04 Batch 3)", () => {
  it("renders quick actions, KPI cards, period picker, and top content exactly as reference", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Quick actions
    expect(await screen.findByText("New upload")).toBeDefined();
    expect(screen.getByText("Live stream")).toBeDefined();
    expect(screen.getByText("View channels")).toBeDefined();
    expect(screen.getByText("Export report")).toBeDefined();

    // KPI Cards
    expect(screen.getByText("Total Channels")).toBeDefined();
    expect(screen.getByText("Live Viewers")).toBeDefined();
    expect(screen.getAllByText("Watch Time").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Estimated Earnings")).toBeDefined();

    // Performance chart title & period pickers
    expect(screen.getByText("Audience & Revenue Performance")).toBeDefined();
    expect(screen.getByText("24H")).toBeDefined();
    expect(screen.getByText("7D")).toBeDefined();
    expect(screen.getByText("30D")).toBeDefined();
    expect(screen.getByText("12M")).toBeDefined();

    // Top-performing content
    expect(screen.getByText("Top-Performing Content")).toBeDefined();
    expect(screen.getByText("Midnight Thriller Ep 1")).toBeDefined();
  });
});
