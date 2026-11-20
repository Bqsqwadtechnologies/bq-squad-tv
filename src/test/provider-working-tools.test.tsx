import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Mock ConsolePageGuard
vi.mock("@/components/ConsolePageGuard", () => ({
  ConsolePageGuard: ({ children }: any) =>
    typeof children === "function"
      ? children({
          token: "mock-provider-token",
          account: {
            email: "provider@example.com",
            roles: ["provider"],
            isOwner: false,
          },
        })
      : children,
}));

global.fetch = vi.fn((url: any, options: any) => {
  if (url.includes("/api/public/v1/provider/channels")) {
    if (options?.method === "PATCH") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, bandwidthCapGbps: 12.5 }),
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          channels: [
            {
              id: "ch_test_1",
              name: "Apex Master Feed",
              logoUrl: null,
              categories: ["Entertainment"],
              language: "en",
              status: "published",
              health: "healthy",
              currentProgramme: "Global News Hour",
              currentViewers: 1400,
              totalWatchMinutes: 12000,
              licenceExpiresAt: "2026-12-31T23:59:59Z",
              bandwidthCapGbps: 8.0,
              errorLogs: [
                {
                  id: "log_01",
                  timestamp: "2026-03-30T10:00:00Z",
                  level: "warn",
                  message: "Test jitter on stream",
                },
              ],
            },
          ],
        }),
    });
  }

  if (url.includes("/api/public/v1/provider/contracts")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          contracts: [
            {
              id: "agr_test",
              agreementReference: "AGR-TEST-2026",
              territories: ["Global"],
            },
          ],
        }),
    });
  }

  if (url.includes("/api/public/v1/provider/disputes")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, disputeId: "disp_123" }),
    });
  }

  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
}) as any;

import { Route } from "@/routes/provider.channels";

describe("Provider Working Tools (V5-04 Batch 6)", () => {
  it("renders contract status card with signed date, revenue share % and download action", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    expect(await screen.findByText("Master Distribution Contract")).toBeDefined();
    expect(screen.getByText("Signed Date")).toBeDefined();
    expect(screen.getByText("January 15, 2026")).toBeDefined();
    expect(screen.getByText(/25.*% Net Share/i)).toBeDefined();
    expect(screen.getByText("Download PDF Contract")).toBeDefined();
  });

  it("renders live latency ping chart with 5 global locations", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    expect(await screen.findByText("Live Edge Latency Ping Chart")).toBeDefined();
    expect(screen.getByText("Lagos")).toBeDefined();
    expect(screen.getByText("Johannesburg")).toBeDefined();
    expect(screen.getByText("London")).toBeDefined();
    expect(screen.getByText("New York")).toBeDefined();
    expect(screen.getByText("Frankfurt")).toBeDefined();
    expect(screen.getByText("Ping Now")).toBeDefined();
  });

  it("renders connected channels list, bandwidth cap, error logs, and dispute modal", async () => {
    const Component = Route.options.component!;
    render(<Component />);

    expect(await screen.findByText("Connected Broadcast Channels")).toBeDefined();
    expect(screen.getByText("Apex Master Feed")).toBeDefined();
    expect(screen.getByText("8 Gbps")).toBeDefined();

    // Toggle error log drawer
    const logBtn = screen.getByText(/Error Log \(1\)/i);
    fireEvent.click(logBtn);
    expect(await screen.findByText("Test jitter on stream")).toBeDefined();

    // Open dispute ticket modal
    const fileDisputeBtn = screen.getByText("File Dispute Ticket");
    fireEvent.click(fileDisputeBtn);

    expect(screen.getByText("File Formal Dispute Ticket")).toBeDefined();
    const subjectInput = screen.getByPlaceholderText(/Discrepancy in March deductible/i);
    const detailsInput = screen.getByPlaceholderText(/Provide specific metrics/i);

    fireEvent.change(subjectInput, { target: { value: "Test dispute subject" } });
    fireEvent.change(detailsInput, { target: { value: "Test dispute details and metrics" } });

    fireEvent.click(screen.getByText("Submit Dispute"));

    expect(await screen.findByText(/Dispute ticket filed successfully/i)).toBeDefined();
  });
});
