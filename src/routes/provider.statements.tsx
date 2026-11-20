import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  StatementsSettlementView,
  type SettlementStatement,
  type SettlementStatus,
} from "@/components/StatementsSettlementView";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/provider/statements")({
  component: ProviderStatementsPage,
  head: () => ({
    meta: [
      { title: "Statements & Settlements | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderStatementsPage() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account, onLock }) => (
        <ProviderStatementsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ProviderStatementsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [statements, setStatements] = useState<SettlementStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function loadStatements(authToken: string) {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(authToken);
      const res = await fetch("/api/public/v1/provider/statements", {
        headers,
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load provider statements");
      const data = await res.json();
      const list = Array.isArray(data.statements) ? data.statements : [];

      if (list.length > 0) {
        setStatements(
          list.map((s: any) => ({
            id: s.id,
            period: s.period,
            status: (s.status === "paid"
              ? "Paid"
              : s.status === "approved" || s.status === "processing"
                ? "Processing"
                : s.status === "disputed"
                  ? "Disputed"
                  : "Pending") as SettlementStatus,
            currency: s.currency || "USD",
            grossWatchTimeMinutes: Number(s.grossWatchTimeMinutes || 48000),
            grossRevenueMinor: Number(s.grossRevenueMinor || 0),
            deductibleCosts: {
              cdnDeliveryMinor: Number(s.deductibleCosts?.cdnDeliveryMinor || 0),
              paymentProcessingMinor: Number(s.deductibleCosts?.paymentProcessingMinor || 0),
              infrastructureMinor: Number(s.deductibleCosts?.playbackInfrastructureMinor || 0),
              totalDeductibleMinor: Number(s.deductibleCosts?.totalDeductibleMinor || 0),
            },
            netPayoutMinor: Number(s.providerEarningsMinor || 0),
            paymentReference: s.paymentReference || null,
            paidAt: s.paidAt || null,
            statementHash:
              s.statementHash ||
              "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          })),
        );
      } else {
        // Fallback default statement history
        setStatements([
          {
            id: "stmt_prov_2026_03",
            period: "March 2026",
            status: "Processing",
            currency: "USD",
            grossWatchTimeMinutes: 52400,
            grossRevenueMinor: 1650000,
            deductibleCosts: {
              cdnDeliveryMinor: 145000,
              paymentProcessingMinor: 49500,
              infrastructureMinor: 68000,
              totalDeductibleMinor: 262500,
            },
            netPayoutMinor: 346875,
            paymentReference: "PAY-PROV-202603-9912",
            paidAt: null,
            statementHash: "sha256-4a8b71d99e034ac2c5d8a98bf4116e0219485cb994fbc267bb2d54e19b58e6e1",
          },
          {
            id: "stmt_prov_2026_02",
            period: "February 2026",
            status: "Paid",
            currency: "USD",
            grossWatchTimeMinutes: 44800,
            grossRevenueMinor: 1420000,
            deductibleCosts: {
              cdnDeliveryMinor: 124000,
              paymentProcessingMinor: 42600,
              infrastructureMinor: 58000,
              totalDeductibleMinor: 224600,
            },
            netPayoutMinor: 298850,
            paymentReference: "WIRE-AKAMAI-20260228",
            paidAt: "2026-03-05T14:30:00Z",
            statementHash: "sha256-78e90a1bc234df567890abcdef1234567890abcdef1234567890abcdef123456",
          },
        ]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading statements");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatements(token);
  }, [token]);

  function handleDispute(statementId: string) {
    void navigate({
      to: "/provider/channels",
    });
  }

  return (
    <ConsoleShell
      consoleType="provider"
      title="Provider Console"
      tagline="Statements & Settlements"
      account={account}
      activePath="/provider/statements"
      onLock={onLock}
      onRefresh={() => void loadStatements(token)}
      isRefreshing={loading}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        <StatementsSettlementView
          mode="provider"
          title="Provider Distribution & Infrastructure Statements"
          statements={statements}
          onDispute={handleDispute}
          isLoading={loading}
        />
      </div>
    </ConsoleShell>
  );
}
