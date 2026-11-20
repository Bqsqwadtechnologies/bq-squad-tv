import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { Route } from "@/routes/wallet";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: any) => config.component,
}));
vi.mock("@/components/BrandLogo", () => ({ BrandLogo: () => <div>BQ SQWAD TV</div> }));
vi.mock("@/lib/firebase-web-auth", () => ({
  getActiveWebIdToken: vi.fn().mockResolvedValue("id-token"),
  getWebAccount: vi.fn().mockResolvedValue({ email: "viewer@example.com", emailVerified: true }),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer id-token" }),
  restoreWebSession: vi.fn().mockResolvedValue("id-token"),
}));

const wallet = {
  balanceMinor: 0,
  currency: "NGN",
  dailySpendLimitMinor: 500000,
  spentTodayMinor: 12500,
};
const ledger = {
  items: [
    {
      id: "txn-1",
      description: "Viewing charge",
      amountMinor: -500,
      createdAt: "2026-11-20T07:00:00.000Z",
      kind: "usage",
      currency: "NGN",
    },
  ],
};
const topups = [
  { packageId: "starter", amountMinor: 100000, creditMinor: 100000, currency: "NGN" },
];

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/wallet")) return new Response(JSON.stringify(wallet), { status: 200 });
      if (url.includes("/wallet/ledger"))
        return new Response(JSON.stringify(ledger), { status: 200 });
      if (url.endsWith("/wallet/topups"))
        return new Response(JSON.stringify(topups), { status: 200 });
      return new Response("{}", { status: 200 });
    }),
  );
}

describe("Viewer wallet (V5-05 Batch 7)", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetch();
  });

  it("shows real wallet packages, transactions, usage and a low-balance action", async () => {
    const Wallet = Route as any;
    render(<Wallet />);
    await waitFor(() => expect(screen.getByText("Your balance is empty")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "View top-up options" })).toHaveAttribute(
      "href",
      "#topups",
    );
    expect(screen.getByText("Today’s usage")).toBeInTheDocument();
    expect(screen.getByText("Recent transactions")).toBeInTheDocument();
    expect(screen.getByText("Viewing charge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Top up with Paystack" })).toBeInTheDocument();
  });
});
