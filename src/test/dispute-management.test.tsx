import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  SharedDisputeSystem,
  type DisputeItem,
} from "@/components/SharedDisputeSystem";

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
  if (url.includes("/api/public/v1/provider/disputes")) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          disputes: [
            {
              id: "disp_test_01",
              subject: "Deductible mismatch for March",
              category: "Deductible Costs Discrepancy",
              statementId: "stmt_prov_2026_03",
              claimedAmountMinor: 40000,
              claimedAmountCurrency: "USD",
              evidenceFileName: "cdn-logs.csv",
              status: "open",
              createdAt: "2026-03-20T10:00:00Z",
              updatedAt: "2026-03-20T10:00:00Z",
              messages: [
                {
                  sender: "provider",
                  text: "Egress was billed 400 higher than origin metrics.",
                  timestamp: "2026-03-20T10:00:00Z",
                },
              ],
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

import { Route as ProviderDisputesRoute } from "@/routes/provider.disputes";

describe("Dispute Management & Resolution (V5-04 Batch 8)", () => {
  const sampleDisputes: DisputeItem[] = [
    {
      id: "disp_101",
      subject: "Overbilled CDN Delivery Fees",
      category: "Deductible Costs Discrepancy",
      statementId: "stmt_2026_03",
      claimedAmountMinor: 35000,
      claimedAmountCurrency: "USD",
      evidenceFileName: "edge-report.pdf",
      status: "resolved",
      createdAt: "2026-03-22T08:00:00Z",
      updatedAt: "2026-03-23T14:00:00Z",
      messages: [
        {
          sender: "provider",
          text: "Bandwidth logs show 12TB delivered, statement shows 15TB.",
          timestamp: "2026-03-22T08:00:00Z",
        },
        {
          sender: "platform",
          text: "Verified with edge routing team. Difference approved.",
          timestamp: "2026-03-23T14:00:00Z",
        },
      ],
      resolution: {
        decision: "accept",
        acceptedAmountMinor: 35000,
        adjustmentStatementPeriod: "April 2026 Statement",
        resolutionNotes: "3TB discrepancy credited as requested.",
        resolvedAt: "2026-03-23T14:00:00Z",
      },
    },
    {
      id: "disp_102",
      subject: "Watch time attribution query",
      category: "Revenue Share Calculation",
      statementId: "stmt_2026_03",
      claimedAmountMinor: 12000,
      claimedAmountCurrency: "USD",
      evidenceFileName: null,
      status: "open",
      createdAt: "2026-03-25T11:00:00Z",
      updatedAt: "2026-03-25T11:00:00Z",
      messages: [
        {
          sender: "provider",
          text: "Can you provide viewer breakdown per channel for midnight broadcast?",
          timestamp: "2026-03-25T11:00:00Z",
        },
      ],
    },
  ];

  it("renders dispute list with filter tabs and resolution card", () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);
    const handleReply = vi.fn().mockResolvedValue(undefined);

    render(
      <SharedDisputeSystem
        mode="provider"
        disputes={sampleDisputes}
        onCreateDispute={handleCreate}
        onSendReply={handleReply}
      />,
    );

    expect(screen.getByText("Dispute Management & Settlement Resolution")).toBeDefined();
    expect(screen.getByText("All Disputes")).toBeDefined();
    expect(screen.getAllByText("Open")[0]).toBeDefined();
    expect(screen.getAllByText("Resolved")[0]).toBeDefined();

    // First selected dispute is disp_101
    expect(screen.getAllByText("Overbilled CDN Delivery Fees")[0]).toBeDefined();
    expect(screen.getByText(/Formal Dispute Settlement Resolution/i)).toBeDefined();
    expect(screen.getByText(/3TB discrepancy credited as requested/i)).toBeDefined();
    expect(screen.getByText("edge-report.pdf")).toBeDefined();
  });

  it("allows switching filter, viewing thread and replying to message", async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);
    const handleReply = vi.fn().mockResolvedValue(undefined);

    render(
      <SharedDisputeSystem
        mode="provider"
        disputes={sampleDisputes}
        onCreateDispute={handleCreate}
        onSendReply={handleReply}
      />,
    );

    // Switch to Open filter
    fireEvent.click(screen.getByRole("button", { name: /^Open/ }));
    expect(screen.getByText("Watch time attribution query")).toBeDefined();

    // Select second dispute
    fireEvent.click(screen.getByText("Watch time attribution query"));

    const replyInput = screen.getByPlaceholderText(/Write a message to operations/i);
    fireEvent.change(replyInput, { target: { value: "Additional context added" } });

    fireEvent.click(screen.getByText("Send"));
    expect(handleReply).toHaveBeenCalledWith("disp_102", "Additional context added");
  });

  it("renders Operations decision controls in admin mode", async () => {
    const handleCreate = vi.fn().mockResolvedValue(undefined);
    const handleReply = vi.fn().mockResolvedValue(undefined);
    const handleResolve = vi.fn().mockResolvedValue(undefined);

    render(
      <SharedDisputeSystem
        mode="admin"
        disputes={sampleDisputes}
        onCreateDispute={handleCreate}
        onSendReply={handleReply}
        onResolveDispute={handleResolve}
      />,
    );

    // Select open dispute
    fireEvent.click(screen.getByText("Watch time attribution query"));

    expect(screen.getByText(/Operations Decision Controls/i)).toBeDefined();
    expect(screen.getByText("Accept Claim")).toBeDefined();
    expect(screen.getByText("Counter-Offer")).toBeDefined();
    expect(screen.getByText("Reject Claim")).toBeDefined();
  });

  it("renders ProviderDisputesPage route with loaded disputes", async () => {
    const Component = ProviderDisputesRoute.options.component!;
    render(<Component />);

    expect((await screen.findAllByText("Deductible mismatch for March"))[0]).toBeDefined();
    expect(screen.getByText("cdn-logs.csv")).toBeDefined();
  });
});
