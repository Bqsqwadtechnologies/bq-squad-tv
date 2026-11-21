import { describe, it, expect, vi, beforeEach } from "vitest";
import * as apiModule from "@/lib/server/api";

const mockDb = new Map<string, any>();

vi.mock("@/lib/server/firebase-admin", () => {
  return {
    ApiError: class ApiError extends Error {
      status: number;
      code: string;
      constructor(status: number, code: string, message: string) {
        super(message);
        this.status = status;
        this.code = code;
      }
    },
    Firestore: {
      create: vi.fn(async () => ({
        docName: (p: string) => p,
        getDoc: vi.fn(async (path: string) => mockDb.get(path) || null),
        query: vi.fn(async (col: string, options?: any) => {
          const results: any[] = [];
          for (const [key, val] of mockDb.entries()) {
            if (key.startsWith(`${col}/`)) {
              results.push({ __id: key.slice(col.length + 1), ...val });
            }
          }
          if (options?.filters) {
            return results.filter((item) => {
              return options.filters.every((f: any) => {
                if (f.op === "EQUAL") return item[f.field] === f.value;
                return true;
              });
            });
          }
          return results;
        }),
      })),
    },
  };
});

describe("Batch B5 — Producer and Provider Screens & Statements", () => {
  beforeEach(() => {
    mockDb.clear();

    // Setup active producer with KYC approved
    mockDb.set("users/prod_screen_user", {
      uid: "prod_screen_user",
      email: "producer@domain.com",
      roleTags: ["producer"],
      appEmailVerified: true,
      emailVerified: true,
    });
    mockDb.set("producers/prod_screen_user", {
      planStatus: "ACTIVE",
      verificationStatus: "APPROVED",
      earningsBalanceByCurrency: { USD: 75000, NGN: 112500000 }, // $750.00
      earningsLifetimeByCurrency: { USD: 250000, NGN: 375000000 },
      payoutReservedByCurrency: { USD: 50000 },
    });
    mockDb.set("kycProfiles/prod_screen_user", {
      kycStatus: "approved",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    mockDb.set("payoutProfiles/prod_screen_user", {
      status: "APPROVED",
      beneficiaryName: "Producer Jane Doe",
      bankName: "Guaranty Trust Bank",
      accountNumberMasked: "******5678",
      currency: "USD",
      country: "US",
    });

    // Payout records
    mockDb.set("payouts/po_1111222233334444555566667777888899990000aaaabbbbccccddddeeeefff0", {
      uid: "prod_screen_user",
      amountMinor: 50000, // $500.00
      currency: "USD",
      status: "PAID",
      createdAt: "2026-03-01T10:00:00Z",
      settledAt: "2026-03-03T14:30:00Z",
      settlementReference: "WIRE-202603-9901",
    });

    // Setup provider representative
    mockDb.set("users/prov_rep_user", {
      uid: "prov_rep_user",
      email: "rep@akamai-cdn.com",
      appEmailVerified: true,
      emailVerified: true,
    });
    mockDb.set("providerUsers/prov_rep_user", {
      providerId: "prov_akamai",
      status: "ACTIVE",
    });
    mockDb.set("providers/prov_akamai", {
      name: "Akamai Delivery Partner",
      status: "ACTIVE",
      verificationStatus: "APPROVED",
    });
    mockDb.set("kycProfiles/prov_akamai", {
      kycStatus: "approved",
      companyName: "Akamai Delivery Partner Ltd",
    });
    mockDb.set("providerStatements/stmt_prov_1", {
      id: "stmt_prov_1",
      providerId: "prov_akamai",
      period: "February 2026",
      status: "paid",
      currency: "USD",
      providerEarningsMinor: 325000,
      paymentReference: "PAY-AKAMAI-FEB26",
      paidAt: "2026-03-05T12:00:00Z",
      statementHash: "sha256-abc123def456789",
    });

    vi.spyOn(apiModule, "requireUser").mockImplementation(async (req: Request) => {
      const auth = req.headers.get("authorization");
      if (!auth) {
        const { ApiError } = await import("@/lib/server/firebase-admin");
        throw new ApiError(401, "UNAUTHENTICATED", "Sign-in required.");
      }
      const token = auth.replace(/^Bearer\s+/i, "");
      if (token === "producer_token") {
        return { uid: "prod_screen_user", email: "producer@domain.com", emailVerified: true, customClaims: {} } as any;
      }
      if (token === "provider_token") {
        return { uid: "prov_rep_user", email: "rep@akamai-cdn.com", emailVerified: true, customClaims: {} } as any;
      }
      throw new Error("Unknown token");
    });
  });

  it("producer earnings endpoint returns own net earnings and payout history with references", async () => {
    const { Route } = await import("@/routes/api/public/v1/producer/earnings");
    const handler = (Route as any).options.server.handlers.GET;

    const req = new Request("http://localhost/api/public/v1/producer/earnings", {
      headers: { authorization: "Bearer producer_token" },
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify own amounts only
    expect(data.currencyBalances.USD).toBe(75000); // $750.00
    expect(data.reservedPayoutsByCurrency.USD).toBe(50000); // $500.00
    expect(data.lifetimeEarningsByCurrency.USD).toBe(250000);

    // Verify no gross revenue or percentage fields
    expect(data.grossRevenueMinor).toBeUndefined();
    expect(data.revenueSharePercentage).toBeUndefined();
    expect(data.platformTakeRate).toBeUndefined();

    // Verify payout history contains reference and settled date
    expect(data.payouts.length).toBeGreaterThan(0);
    const payout = data.payouts[0];
    expect(payout.amountMinor).toBe(50000);
    expect(payout.status).toBe("PAID");
    expect(payout.settlementReference).toBe("WIRE-202603-9901");
    expect(payout.settledAt).toBe("2026-03-03T14:30:00Z");
  });

  it("provider statements endpoint returns own net earnings only without platform percentages", async () => {
    const { Route } = await import("@/routes/api/public/v1/provider/statements");
    const handler = (Route as any).options.server.handlers.GET;

    const req = new Request("http://localhost/api/public/v1/provider/statements", {
      headers: { authorization: "Bearer provider_token" },
    });

    const res = await handler({ request: req });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.statements)).toBe(true);
    expect(data.statements.length).toBe(1);

    const stmt = data.statements[0];
    expect(stmt.id).toBe("stmt_prov_1");
    expect(stmt.providerEarningsMinor).toBe(325000);
    expect(stmt.paymentReference).toBe("PAY-AKAMAI-FEB26");
    expect(stmt.status).toBe("paid");

    // Verify gross revenue / platform cut is not disclosed
    expect(stmt.grossPoolMinor).toBeUndefined();
    expect(stmt.platformMarginPercentage).toBeUndefined();
  });
});
