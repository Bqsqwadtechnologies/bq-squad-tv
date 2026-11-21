import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { Route } from "@/routes/wallet";
import { DEFAULT_NGN_TOPUPS, getPaystackTopup } from "@/lib/server/paystack";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config.component,
}));
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => <div>BQ SQWAD TV</div> }));
vi.mock("@/lib/firebase-web-auth", () => ({
  getActiveWebIdToken: vi.fn().mockResolvedValue("id-token"),
  getWebAccount: vi.fn().mockResolvedValue({ uid: "viewer-1", email: "viewer@example.com", emailVerified: true }),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer id-token" }),
  restoreWebSession: vi.fn().mockResolvedValue("id-token"),
}));

const mockWallet = {
  balanceMinor: 250000,
  currency: "NGN",
  dailySpendLimitMinor: 500000,
  spentTodayMinor: 12500,
};

const mockLedger = {
  items: [
    {
      id: "topup-1",
      description: "Website wallet top-up",
      amountMinor: 250000,
      createdAt: "2026-11-20T08:00:00.000Z",
      kind: "wallet_topup",
      currency: "NGN",
    },
  ],
};

describe("Wallet & Paystack Batch 5 Requirements", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/wallet")) return new Response(JSON.stringify(mockWallet), { status: 200 });
        if (url.includes("/wallet/ledger"))
          return new Response(JSON.stringify(mockLedger), { status: 200 });
        if (url.endsWith("/wallet/topups")) return new Response(JSON.stringify([]), { status: 200 });
        if (url.endsWith("/verify")) return new Response(JSON.stringify({ credited: true }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
  });

  it("provides all 12 default top-up amounts starting with ₦200 minimum", () => {
    const expected = [
      "ngn_200",
      "ngn_500",
      "ngn_1000",
      "ngn_1500",
      "ngn_2000",
      "ngn_2500",
      "ngn_5000",
      "ngn_10000",
      "ngn_15000",
      "ngn_20000",
      "ngn_100000",
      "ngn_200000",
    ];

    for (const pkg of expected) {
      expect(DEFAULT_NGN_TOPUPS[pkg]).toBeDefined();
      expect(DEFAULT_NGN_TOPUPS[pkg].amountMinor).toBeGreaterThanOrEqual(20000); // ₦200 minimum = 20,000 kobo
    }
  });

  it("blocks custom amounts below ₦200 on the server", () => {
    const config = { walletTopups: {} };
    // ₦199 is 19,900 kobo -> must throw
    expect(() => getPaystackTopup(config, "custom", "NGN", 19900)).toThrow(
      expect.objectContaining({ code: "TOPUP_MINIMUM_REQUIRED" }),
    );

    // ₦200 is 20,000 kobo -> succeeds
    const valid = getPaystackTopup(config, "custom", "NGN", 20000);
    expect(valid.amountMinor).toBe(20000);
  });

  it("renders all top-up chips in UI and shows available balance", async () => {
    const Wallet = Route as any;
    render(<Wallet />);

    await waitFor(() => expect(screen.getByText("Available balance")).toBeInTheDocument());
    expect(screen.getByText("NGN 2,500.00")).toBeInTheDocument();

    // Check chips exist
    expect(screen.getByText("₦200")).toBeInTheDocument();
    expect(screen.getByText("₦500")).toBeInTheDocument();
    expect(screen.getByText("₦1,000")).toBeInTheDocument();
    expect(screen.getByText("₦2,000")).toBeInTheDocument();
    expect(screen.getByText("₦5,000")).toBeInTheDocument();
    expect(screen.getByText("₦10,000")).toBeInTheDocument();
    expect(screen.getByText("₦200,000")).toBeInTheDocument();

    // Custom amount option
    expect(screen.getAllByText(/custom amount/i).length).toBeGreaterThanOrEqual(1);
  });
});
