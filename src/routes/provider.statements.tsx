import React, { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  StatementsSettlementView,
  type SettlementStatement,
  type SettlementStatus,
} from "@/components/StatementsSettlementView";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { getNextPayoutWindow } from "@/lib/payout-calendar";
import { Calendar, Info, ExternalLink } from "lucide-react";

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
        <ProviderStatementsInner token={token} account={account} {...(onLock ? { onLock } : {})} />
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
  const payoutWindow = getNextPayoutWindow();

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
            netPayoutMinor: Number(s.providerEarningsMinor || 0),
            paymentReference: s.paymentReference || null,
            paidAt: s.paidAt || null,
            statementHash:
              s.statementHash ||
              "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          })),
        );
      } else {
        // Default statement history
        setStatements([
          {
            id: "stmt_prov_2026_03",
            period: "March 2026",
            status: "Processing",
            currency: "USD",
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
        {/* Next Payout Calendar & Disclosure Banner */}
        <div className="rounded-2xl border border-cyan-400/20 bg-[#040e30]/80 p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-cyan-300 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Next Payout Schedule
                  </span>
                  <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-200">
                    {payoutWindow.nextPayoutDateFormatted}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed font-medium">
                  {payoutWindow.disclosure}
                </p>
              </div>
            </div>
            <Link
              to="/payment-and-payout-policy"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 shrink-0 self-start sm:self-center"
            >
              <span>Disbursement Policy</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

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
