import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock ConsolePageGuard
vi.mock("@/components/ConsolePageGuard", () => ({
  ConsolePageGuard: ({ children }: any) =>
    typeof children === "function"
      ? children({
          token: "mock-token",
          account: {
            email: "provider@example.com",
            roles: ["provider"],
            isOwner: false,
          },
        })
      : children,
}));

global.fetch = vi.fn((url: any) => {
  if (url.includes("/api/public/v1/provider/dashboard")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          provider: {
            id: "prov_akamai",
            name: "Akamai Global Delivery",
            settlementCurrency: "USD",
            providerShareBps: 2500,
          },
          metrics: {
            channelsCount: 3,
            connectedChannels: 3,
            activeChannels: 2,
            activeIngestStreams: 2,
            deliveryBandwidthGbps: 14.8,
            uptimeSlaPercent: 99.98,
            estimatedViewers: 3200,
            totalWatchMinutes: 48000,
            totalWatchHours: 800,
            estimatedGrossRevenueMinor: 1500000,
            allocatedDeductibleCostsMinor: 225000,
            grossProfitMinor: 1275000,
            estimatedEarningsMinor: 318750,
            pendingPaymentsMinor: 50000,
            completedPaymentsMinor: 250000,
            currency: "USD",
            isEstimate: true,
            periodTag: "March 2026",
            streamMonitors: [
              {
                id: "stream_1",
                channelName: "Apex Primary Main Feed",
                status: "Healthy",
                bitrateMbps: 5.8,
                fps: 60,
                latencySec: 1.4,
                resolution: "1080p60",
                previewUrl: "/brand/bq-sqwad-tv-logo.png",
              },
              {
                id: "stream_2",
                channelName: "Apex Backup Edge Stream",
                status: "Degraded",
                bitrateMbps: 2.4,
                fps: 24,
                latencySec: 4.8,
                resolution: "720p",
                previewUrl: "/brand/bq-sqwad-tv-logo.png",
              },
            ],
          },
        }),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
}) as any;

import { Route } from "@/routes/provider.index";

describe("Provider Dashboard (V5-04 Batch 5)", () => {
  it("renders quick actions, KPI cards, and live stream monitor grid with telemetry", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Quick actions
    expect(await screen.findByText("Add stream")).toBeDefined();
    expect(screen.getByText("Test latency")).toBeDefined();
    expect(screen.getByText("Provider settings")).toBeDefined();
    expect(screen.getByText("Rotate credentials")).toBeDefined();

    // Provider KPI cards
    expect(screen.getByText("Connected Channels")).toBeDefined();
    expect(screen.getByText("Active Ingest Streams")).toBeDefined();
    expect(screen.getByText("Delivery Bandwidth")).toBeDefined();
    expect(screen.getByText("Uptime SLA Gauge")).toBeDefined();
    expect(screen.getByText("99.98%")).toBeDefined();

    // Live stream monitor grid
    expect(screen.getByText("Live Stream Monitor Grid")).toBeDefined();
    expect(screen.getByText("Apex Primary Main Feed")).toBeDefined();
    expect(screen.getByText("Healthy")).toBeDefined();
    expect(screen.getByText("5.8 Mbps")).toBeDefined();
    expect(screen.getByText("Apex Backup Edge Stream")).toBeDefined();
    expect(screen.getByText("Degraded")).toBeDefined();
  });

  it("handles latency testing and credential rotation dialogs", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    // Latency test
    const testLatencyBtn = await screen.findByText("Test latency");
    fireEvent.click(testLatencyBtn);

    expect(screen.getByText("Edge Network Latency Test")).toBeDefined();

    // Close and test credentials rotation
    const doneBtn = await screen.findByText("Done", {}, { timeout: 3000 });
    fireEvent.click(doneBtn);

    const rotateBtn = screen.getByText("Rotate credentials");
    fireEvent.click(rotateBtn);

    expect(screen.getByText("Rotate Provider Ingest Credentials")).toBeDefined();
    fireEvent.click(screen.getByText("Generate New Key"));
    expect(await screen.findByText("New Secret Key Generated:")).toBeDefined();
  });
});
