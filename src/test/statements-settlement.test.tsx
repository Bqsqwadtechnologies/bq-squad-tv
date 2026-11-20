import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  StatementsSettlementView,
  type SettlementStatement,
} from "@/components/StatementsSettlementView";

// Mock ConsolePageGuard for route test
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
  if (url.includes("/api/public/v1/provider/statements")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          statements: [
            {
              id: "stmt_prov_test_01",
              period: "March 2026",
              status: "paid",
              currency: "USD",
              grossWatchTimeMinutes: 60000,
              grossRevenueMinor: 2000000,
              deductibleCosts: {
                cdnDeliveryMinor: 200000,
                paymentProcessingMinor: 50000,
                playbackInfrastructureMinor: 80000,
                totalDeductibleMinor: 330000,
              },
              providerEarningsMinor: 417500,
              paymentReference: "WIRE-TEST-001",
              paidAt: "2026-03-10T12:00:00Z",
              statementHash: "sha256-abc1234567890",
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

import { Route as ProviderStatementsRoute } from "@/routes/provider.statements";

describe("Statements & Settlements (V5-04 Batch 7)", () => {
  const sampleStatements: SettlementStatement[] = [
    {
      id: "stmt_test_1",
      period: "March 2026",
      status: "Processing",
      currency: "USD",
      grossWatchTimeMinutes: 54000,
      grossRevenueMinor: 1800000,
      deductibleCosts: {
        cdnDeliveryMinor: 150000,
        paymentProcessingMinor: 54000,
        infrastructureMinor: 72000,
        totalDeductibleMinor: 276000,
      },
      netPayoutMinor: 381000,
      paymentReference: "REF-TEST-99",
      paidAt: null,
      statementHash: "sha256-test-hash-value-123456",
    },
    {
      id: "stmt_test_2",
      period: "February 2026",
      status: "Paid",
      currency: "USD",
      grossWatchTimeMinutes: 48000,
      grossRevenueMinor: 1500000,
      deductibleCosts: {
        cdnDeliveryMinor: 120000,
        paymentProcessingMinor: 45000,
        infrastructureMinor: 60000,
        totalDeductibleMinor: 225000,
      },
      netPayoutMinor: 318750,
      paymentReference: "WIRE-TEST-88",
      paidAt: "2026-03-05T10:00:00Z",
      statementHash: "sha256-test-hash-value-789012",
    },
  ];

  it("renders monthly statement table with period, watch time, revenue, deductions, and status badges", () => {
    render(
      <StatementsSettlementView
        mode="producer"
        title="Producer Settlement Statements"
        statements={sampleStatements}
      />,
    );

    expect(screen.getByText("Producer Settlement Statements")).toBeDefined();
    expect(screen.getByText("Producer Mode")).toBeDefined();

    // Table rows
    expect(screen.getByText("March 2026")).toBeDefined();
    expect(screen.getByText("February 2026")).toBeDefined();
    expect(screen.getByText("Processing")).toBeDefined();
    expect(screen.getByText("Paid")).toBeDefined();

    // Watch times
    expect(screen.getByText("900h")).toBeDefined();
    expect(screen.getByText("800h")).toBeDefined();
  });

  it("opens statement detail modal with line-item breakdown and signed PDF download", async () => {
    render(
      <StatementsSettlementView
        mode="provider"
        statements={sampleStatements}
      />,
    );

    const viewDetailsButtons = screen.getAllByText("View Details");
    fireEvent.click(viewDetailsButtons[0]);

    // Modal details
    expect(screen.getByText(/Statement Details — March 2026/i)).toBeDefined();
    expect(screen.getByText(/Tamper-Evident SHA-256 Audit Seal/i)).toBeDefined();
    expect(screen.getByText("sha256-test-hash-value-123456")).toBeDefined();
    expect(screen.getByText("Settlement Line-Item Breakdown")).toBeDefined();
    expect(screen.getByText("Gross Watch Time Revenue")).toBeDefined();
    expect(screen.getByText("Less: CDN Egress & Edge Distribution")).toBeDefined();
    expect(screen.getByText("Net Settlement Payout")).toBeDefined();

    // Download signed PDF
    const downloadBtn = screen.getByText("Download Signed PDF");
    fireEvent.click(downloadBtn);

    expect(await screen.findByText(/Signed statement document for March 2026 downloaded/i)).toBeDefined();
  });

  it("renders ProviderStatementsPage route with loaded provider statements", async () => {
    const Component = ProviderStatementsRoute.options.component!;
    render(<Component />);

    expect(await screen.findByText("Provider Distribution & Infrastructure Statements")).toBeDefined();
    expect(screen.getByText("Provider Mode")).toBeDefined();
    expect(screen.getByText("March 2026")).toBeDefined();
  });
});
