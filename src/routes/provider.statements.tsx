import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, FileText, LoaderCircle, Printer } from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type Statement = {
  id: string;
  period: string;
  status: string;
  currency: string;
  grossRevenueMinor: number;
  deductibleCosts: {
    cdnDeliveryMinor: number;
    paymentProcessingMinor: number;
    providerFeesMinor: number;
    playbackInfrastructureMinor: number;
    totalDeductibleMinor: number;
  };
  grossProfitMinor: number;
  providerShareBps: number;
  providerEarningsMinor: number;
  platformShareMinor: number;
  paymentReference: string | null;
  paidAt: string | null;
  statementHash: string;
  isEstimate: boolean;
};

function formatCurrency(minorUnits: number, currency: string) {
  try {
    const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(minorUnits / (10 ** digits));
  } catch {
    return `${currency} ${(minorUnits / 100).toFixed(2)}`;
  }
}

export const Route = createFileRoute("/provider/statements")({
  component: ProviderStatementsPage,
  head: () => ({
    meta: [
      { title: "Statements | Partner Portal" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProviderStatementsPage() {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          setError("Please sign in from the partner portal home.");
          setBusy(false);
          return;
        }
        const res = await fetch("/api/public/v1/provider/statements", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load partner statements");
        const data = await res.json() as { statements: Statement[] };
        if (active) setStatements(data.statements || []);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function exportCSV(statement: Statement) {
    const rows = [
      ["Item", "Amount", "Currency"],
      ["Period", statement.period, ""],
      ["Status", statement.status, ""],
      ["Gross Viewing Revenue", (statement.grossRevenueMinor / 100).toFixed(2), statement.currency],
      ["Payment Processing Costs", (statement.deductibleCosts.paymentProcessingMinor / 100).toFixed(2), statement.currency],
      ["Infrastructure Costs", (statement.deductibleCosts.playbackInfrastructureMinor / 100).toFixed(2), statement.currency],
      ["Total Deductibles", (statement.deductibleCosts.totalDeductibleMinor / 100).toFixed(2), statement.currency],
      ["Net Gross Profit", (statement.grossProfitMinor / 100).toFixed(2), statement.currency],
      ["Partner Share BPS", statement.providerShareBps.toString(), "bps"],
      ["Partner Earnings", (statement.providerEarningsMinor / 100).toFixed(2), statement.currency],
      ["Payment Reference", statement.paymentReference || "Unpaid", ""],
      ["Hash Audit", statement.statementHash, ""],
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `statement_${statement.period.replace(/\s+/g, "_")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20 print:hidden">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/provider"
              aria-label="Back to partner dashboard"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Monthly Statements</h1>
          </div>
          <Link
            to="/provider"
            aria-label="Return to partner dashboard"
            className="text-xs text-cyan-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 rounded"
          >
            Partner Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full" role="main">
        {busy ? (
          <div className="py-24 text-center" role="status" aria-live="polite">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading statements...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm" role="alert">
            {error}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-white">Revenue Share Statements</h2>
                <p className="text-xs text-slate-400">Calculated strictly as contracted percentage of Net Gross Profit.</p>
              </div>
            </div>

            {statements.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800" role="status">
                <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-white mb-1">No closed statements yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Statements are closed on the 1st of each calendar month following verified viewing ledger reconciliation.
                </p>
              </div>
            ) : (
              <div className="space-y-4" role="region" aria-label="Provider revenue statements">
                {statements.map((s) => (
                  <div key={s.id} tabIndex={0} className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white">{s.period}</h3>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                            s.status === "paid"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : s.status === "approved"
                              ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {s.status} {s.isEstimate ? "(Estimate)" : ""}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">Statement ID: {s.id}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => exportCSV(s)}
                          aria-label={`Export statement ${s.period} as CSV`}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                        >
                          <Download className="w-3.5 h-3.5" />
                          CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => window.print()}
                          aria-label={`Print statement ${s.period}`}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          Print
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block mb-1">Gross Viewing Revenue</span>
                        <span className="text-sm font-semibold text-white">
                          {formatCurrency(s.grossRevenueMinor, s.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Allocated Deductibles</span>
                        <span className="text-sm font-semibold text-rose-400">
                          -{formatCurrency(s.deductibleCosts.totalDeductibleMinor, s.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1">Net Gross Profit</span>
                        <span className="text-sm font-semibold text-blue-400">
                          {formatCurrency(s.grossProfitMinor, s.currency)}
                        </span>
                      </div>
                      <div className="bg-cyan-950/20 p-2.5 rounded-xl border border-cyan-800/30">
                        <span className="text-cyan-400 block mb-1 font-medium">Partner Earnings ({(s.providerShareBps / 100).toFixed(1)}%)</span>
                        <span className="text-base font-bold text-cyan-300">
                          {formatCurrency(s.providerEarningsMinor, s.currency)}
                        </span>
                      </div>
                    </div>

                    {s.paymentReference && (
                      <div className="pt-2 text-xs text-slate-400 flex items-center justify-between border-t border-slate-800/60">
                        <span>Payment Reference: <span className="text-slate-200 font-mono">{s.paymentReference}</span></span>
                        <span>Paid: {s.paidAt ? new Date(s.paidAt).toLocaleDateString() : "Settled"}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
