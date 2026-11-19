import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { SecurityEventsView } from "@/components/SecurityEventsView";
import * as firebaseWebAuth from "@/lib/firebase-web-auth";

vi.mock("@/lib/firebase-web-auth", () => ({
  restoreWebSession: vi.fn(),
  getWebAuthHeaders: vi.fn().mockResolvedValue({ authorization: "Bearer fake-token" }),
  signInWithEmailPassword: vi.fn(),
}));

describe("Batch 10: SecurityEventsView React Component", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = globalThis.fetch;
    vi.mocked(firebaseWebAuth.restoreWebSession).mockResolvedValue("mock-session-token");
    vi.mocked(firebaseWebAuth.getWebAuthHeaders).mockResolvedValue({
      authorization: "Bearer mock-session-token",
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renders the security events view, filters, hourly breakdown and table", async () => {
    const mockEvents = [
      {
        id: "ev-1",
        time: "2026-11-18T14:15:00.000Z",
        actorHash: "abcd1111222233334444555566667777888899990000aaaabbbbccccddddeeee",
        actorRoleClass: "viewer",
        routePattern: "/api/public/v1/zillionaire/overview",
        method: "GET",
        requiredRole: "admin",
        resourceKind: "admin_module",
        reasonCode: "CROSS_ROLE_DENIED",
        coarseNetworkHash: "net1",
        platformClass: "web",
        expiresAt: "2027-02-16T14:15:00.000Z",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: mockEvents,
        hourlyCounts: [{ hour: "2026-11-18T14", count: 1 }],
        total: 1,
      }),
    } as unknown as Response);

    render(<SecurityEventsView isOwner={false} sessionToken="mock-session" />);

    // Header and section heading
    expect(await screen.findByText(/Access restriction ledger/i)).toBeDefined();
    expect(screen.getByText(/Hourly event counts/i)).toBeDefined();

    // Filters exist
    expect(screen.getByLabelText(/Time Window/i)).toBeDefined();
    expect(screen.getByLabelText(/Restriction Reason/i)).toBeDefined();
    expect(screen.getByLabelText(/Account Role/i)).toBeDefined();
    expect(screen.getByLabelText(/Platform \/ Client/i)).toBeDefined();
    expect(screen.getByLabelText(/Route Pattern Match/i)).toBeDefined();

    // Table renders the event row
    await waitFor(() => {
      expect(screen.getAllByText(/Cross-role restricted/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("/api/public/v1/zillionaire/overview")).toBeDefined();
    });

    // When isOwner is false, "Owner only" badge is shown
    expect(screen.getByText(/Owner only/i)).toBeDefined();
  });

  it("allows owner to open step-up modal and look up account identity", async () => {
    const mockHash = "abcd1111222233334444555566667777888899990000aaaabbbbccccddddeeee";
    const mockEvents = [
      {
        id: "ev-2",
        time: "2026-11-18T15:00:00.000Z",
        actorHash: mockHash,
        actorRoleClass: "producer",
        routePattern: "/api/public/v1/zillionaire/pricing",
        method: "POST",
        requiredRole: "admin",
        resourceKind: "pricing",
        reasonCode: "MISSING_MODULE",
        coarseNetworkHash: "net2",
        platformClass: "android",
        expiresAt: "2027-02-16T15:00:00.000Z",
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL, opts?: RequestInit) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/public/v1/zillionaire/security/events")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            events: mockEvents,
            hourlyCounts: [{ hour: "2026-11-18T15", count: 1 }],
            total: 1,
          }),
        } as unknown as Response);
      }
      if (urlStr.includes("/api/public/v1/zillionaire/security/lookup-actor")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            found: true,
            account: {
              uid: "usr_resolved_999",
              email: "resolved@example.com",
              roleTags: ["producer"],
              createdAt: "2026-09-01T00:00:00.000Z",
            },
            actorHash: mockHash,
          }),
        } as unknown as Response);
      }
      return Promise.reject(new Error("Unknown URL " + urlStr));
    });

    render(<SecurityEventsView isOwner={true} sessionToken="mock-session" />);

    // Owner should see "Look up" button
    const lookupBtn = await screen.findByRole("button", { name: /Look up account/i });
    expect(lookupBtn).toBeDefined();

    // Click "Look up" to open step-up modal
    fireEvent.click(lookupBtn);

    // Modal is now open
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Audited Identity Lookup/i)).toBeDefined();

    // Step-up inputs: reason and confirmation checkbox
    const reasonInput = screen.getByLabelText(/Reason for identity lookup/i);
    const stepUpCheck = screen.getByRole("checkbox");
    const confirmBtn = screen.getByRole("button", { name: /Confirm & look up/i });

    // Confirm button should be disabled before required fields
    expect(confirmBtn.hasAttribute("disabled")).toBe(true);

    // Fill in required reason and step-up check
    fireEvent.change(reasonInput, { target: { value: "Investigating unauthorized probing" } });
    fireEvent.click(stepUpCheck);

    expect(confirmBtn.hasAttribute("disabled")).toBe(false);

    // Submit lookup request
    fireEvent.click(confirmBtn);

    // Resolved account details should display
    await waitFor(() => {
      expect(screen.getByText(/Account successfully resolved/i)).toBeDefined();
      expect(screen.getByText("usr_resolved_999")).toBeDefined();
      expect(screen.getByText("resolved@example.com")).toBeDefined();
    });
  });
});
