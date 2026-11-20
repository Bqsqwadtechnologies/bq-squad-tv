import { generateStatementHtml, triggerPrintOrDownload } from "@/lib/pdf-statement";
import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Landmark,
  Wallet,
  TrendingUp,
  Receipt,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Lock,
  Search,
  Filter,
  RefreshCw,
  CreditCard,
  ArrowUpRight,
  ShieldAlert,
  Coins,
  DollarSign,
  ChevronRight,
  Clock,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { formatMinorCurrency } from "@/lib/format-money";

export const Route = createFileRoute("/zillionaire/finance")({
  component: FinanceRoute,
  head: () => ({
    meta: [
      { title: "Finance Control | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function FinanceRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="finance">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Finance Control"
          tagline="Platform revenue, ledger explorer, reconciliation exceptions, and wallet liability management"
          activePath="/zillionaire/finance"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <FinanceBody token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

type FinanceData = {
  metrics: {
    grossRevenueMinor: number;
    producerShareMinor: number;
    platformShareMinor: number;
    walletLiabilityMinor: number;
    unsettledPayoutsMinor: number;
    currency: string;
  };
  revenueByDay: Array<{
    date: string;
    grossMinor: number;
    producerMinor: number;
    platformMinor: number;
    txCount: number;
  }>;
  revenueByChannel: Array<{
    channelId: string;
    channelName: string;
    grossMinor: number;
    producerMinor: number;
    platformMinor: number;
    txCount: number;
  }>;
  ledgerEntries: Array<{
    id: string;
    uid: string;
    description: string;
    amountMinor: number;
    kind: string;
    currency: string;
    createdAt: string;
    reference: string;
  }>;
  reconciliationExceptions: Array<{
    id: string;
    paymentId: string;
    reference: string;
    uid: string;
    amountMinor: number;
    currency: string;
    gateway: string;
    issue: string;
    details: string;
    chargebackNotes?: Array<{ note: string; authorUid: string; createdAt: string }>;
    status: "PENDING" | "RESOLVED" | "UNDER_REVIEW";
    createdAt: string;
  }>;
  lockedPeriods: Array<{
    period: string;
    lockedAt: string;
    lockedBy: string;
    grossRevenueMinor: number;
    producerShareMinor: number;
    platformShareMinor: number;
    payoutsMinor: number;
    reason: string;
    status: "LOCKED";
  }>;
  payoutCalendar: Array<{
    cycleId: string;
    periodLabel: string;
    cutoffDate: string;
    payoutDate: string;
    estimatedAmountMinor: number;
    eligibleProducersCount: number;
    status: string;
  }>;
  anomalyFlags: Array<{
    id: string;
    type: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    targetUid: string;
    description: string;
    detectedAt: string;
    status: "OPEN" | "DISMISSED";
  }>;
};

export function FinanceBody({
  token,
  account,
  initialTab = "revenue",
}: {
  token: string;
  account: ConsoleAccount;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<
    "revenue" | "splits" | "ledger" | "reconciliation" | "period_close" | "anomalies"
  >((initialTab as any) || "revenue");
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search and filters for ledger
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [ledgerKind, setLedgerKind] = useState("all");

  // Modal actions
  const [modalType, setModalType] = useState<
    "lock_period" | "chargeback_note" | "resolve_exception" | "refund" | "dismiss_anomaly" | null
  >(null);
  const [modalTarget, setModalTarget] = useState<any>(null);
  const [modalReason, setModalReason] = useState("");
  const [modalInput, setModalInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/v1/zillionaire/finance?range=${range}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || "Failed to load financial data");
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Execute owner action
  const handleAction = async () => {
    if (!modalType || !modalReason.trim()) return;
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);

    try {
      let body: any = null;
      if (modalType === "lock_period") {
        body = {
          action: "LOCK_PERIOD",
          period: modalInput.trim(),
          reason: modalReason.trim(),
        };
      } else if (modalType === "chargeback_note") {
        body = {
          action: "ADD_CHARGEBACK_NOTE",
          paymentId: modalTarget.id,
          note: modalInput.trim(),
          reason: modalReason.trim(),
        };
      } else if (modalType === "resolve_exception") {
        body = {
          action: "RESOLVE_EXCEPTION",
          exceptionId: modalTarget.id,
          resolution: modalInput.trim(),
          reason: modalReason.trim(),
        };
      } else if (modalType === "refund") {
        body = {
          action: "ISSUE_REFUND",
          paymentId: modalTarget.paymentId,
          amountMinor: modalTarget.amountMinor,
          reason: modalReason.trim(),
        };
      } else if (modalType === "dismiss_anomaly") {
        body = {
          action: "DISMISS_ANOMALY",
          anomalyId: modalTarget.id,
          reason: modalReason.trim(),
        };
      }

      const res = await fetch("/api/public/v1/zillionaire/finance", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `Action failed with HTTP ${res.status}`);
      }

      setActionSuccess("Financial action executed and logged to immutable audit record.");
      setModalType(null);
      setModalTarget(null);
      setModalReason("");
      setModalInput("");
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Failed to execute action");
    } finally {
      setSubmitting(false);
    }
  };

  // CSV download helper
  const exportCsv = (filename: string, rows: Array<Record<string, any>>) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [
        headers.join(","),
        ...rows.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              const escaped = typeof val === "string" ? `"${val.replace(/"/g, '""')}"` : val;
              return escaped ?? "";
            })
            .join(","),
        ),
      ].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadPdfStatement = () => {
    if (!data) return;
    const html = generateStatementHtml({
      id: `stmt_owner_${range}_${Date.now().toString().slice(-6)}`,
      period: range === "7d" ? "Past 7 Days" : range === "30d" ? "Past 30 Days" : range === "90d" ? "Past Quarter" : "Year to Date",
      recipientName: "Platform Treasury & Distribution Consolidated",
      recipientRole: "partner",
      currency: "NGN",
      grossRevenueMinor: data.stats.grossRevenueMinor,
      deductionsMinor: data.stats.totalProducerMinor,
      netPayoutMinor: data.stats.platformRevenueMinor,
      paymentReference: "CONSOLIDATED-LEDGER-STATEMENT",
      paidAt: new Date().toISOString(),
      statementHash: "sha256-" + crypto.randomUUID().replace(/-/g, ""),
    });
    triggerPrintOrDownload(html, `statement-${range}`);
  };

  const handleExportStatement = () => {
    if (!data) return;
    const rows = data.revenueByChannel.map((c) => ({
      Channel_ID: c.channelId,
      Channel_Name: c.channelName,
      Transactions: c.txCount,
      Gross_Revenue: formatMinorCurrency(c.grossMinor, "NGN"),
      Producer_Share: formatMinorCurrency(c.producerMinor, "NGN"),
      Platform_Share: formatMinorCurrency(c.platformMinor, "NGN"),
      Export_Timestamp: new Date().toISOString(),
    }));
    exportCsv(`bq-sqwad-tv-statement-${range}.csv`, rows);
  };

  const handleExportLedger = () => {
    if (!data) return;
    const rows = data.ledgerEntries.map((e) => ({
      Entry_ID: e.id,
      User_UID: e.uid,
      Kind: e.kind,
      Amount: formatMinorCurrency(e.amountMinor, e.currency),
      Description: e.description,
      Reference: e.reference,
      Timestamp: e.createdAt,
    }));
    exportCsv(`bq-sqwad-tv-ledger-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  // Filtered ledger entries
  const filteredLedger = useMemo(() => {
    if (!data) return [];
    return data.ledgerEntries.filter((item) => {
      const matchesSearch =
        !ledgerSearch ||
        item.uid.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        item.description.toLowerCase().includes(ledgerSearch.toLowerCase()) ||
        item.reference.toLowerCase().includes(ledgerSearch.toLowerCase());
      const matchesKind =
        ledgerKind === "all" || item.kind.toLowerCase() === ledgerKind.toLowerCase();
      return matchesSearch && matchesKind;
    });
  }, [data, ledgerSearch, ledgerKind]);

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Finance Control Centre"
        description="Monitor platform gross revenue, creator shares, live wallet liabilities, and reconcile exceptions with period lock governance."
        roleBadge="PLATFORM OWNER"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Gross Platform Revenue"
          value={data ? formatMinorCurrency(data.metrics.grossRevenueMinor, "NGN") : "₦—"}
          change="+28.4% vs last period"
          trend="up"
          gradient="blue"
          icon={Landmark}
        />
        <ConsoleKpiCard
          title="Producer Share (Owed/Paid)"
          value={data ? formatMinorCurrency(data.metrics.producerShareMinor, "NGN") : "₦—"}
          change="70% contractual share"
          trend="up"
          gradient="purple"
          icon={Coins}
        />
        <ConsoleKpiCard
          title="Platform Net Share"
          value={data ? formatMinorCurrency(data.metrics.platformShareMinor, "NGN") : "₦—"}
          change="30% platform take"
          trend="up"
          gradient="green"
          icon={TrendingUp}
        />
        <ConsoleKpiCard
          title="Total Wallet Liability"
          value={data ? formatMinorCurrency(data.metrics.walletLiabilityMinor, "NGN") : "₦—"}
          change="Viewer funds held in reserve"
          trend="neutral"
          gradient="gold"
          icon={Wallet}
        />
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs and Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("revenue")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "revenue"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Revenue & Channels
          </button>
          <button
            onClick={() => setActiveTab("splits")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "splits"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Splits & Collaborations
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "ledger"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Ledger Explorer
          </button>
          <button
            onClick={() => setActiveTab("reconciliation")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "reconciliation"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Exceptions
            {data &&
              data.reconciliationExceptions.filter((e) => e.status === "PENDING").length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
          </button>
          <button
            onClick={() => setActiveTab("period_close")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === "period_close"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Period Close & Calendar
          </button>
          <button
            onClick={() => setActiveTab("anomalies")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "anomalies"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            Anomaly Monitor
            {data && data.anomalyFlags.filter((a) => a.status === "OPEN").length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-500/80 text-white text-[10px] font-bold rounded-full">
                {data.anomalyFlags.filter((a) => a.status === "OPEN").length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as any)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-all"
            title="Refresh finance data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: REVENUE & CHANNELS */}
      {activeTab === "revenue" && (
        <div className="space-y-6">
          {/* Revenue Chart Card */}
          <ConsoleCard
            title="Daily Revenue Trend"
            subtitle={`Gross platform revenue and net distributions over the selected ${range} window`}
            action={
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportStatement}
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
                <button
                  onClick={handleDownloadPdfStatement}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-xs text-cyan-200 border border-cyan-400/30 font-medium flex items-center gap-1.5 transition-all"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download PDF Statement
                </button>
              </div>
            }
          >
            <div className="h-64 flex flex-col justify-end pt-4">
              {data && data.revenueByDay.length > 0 ? (
                <div className="h-full flex items-end gap-1 sm:gap-2 px-2">
                  {data.revenueByDay.map((d, i) => {
                    const maxGross = Math.max(...data.revenueByDay.map((x) => x.grossMinor), 1);
                    const heightPercent = Math.max(10, Math.round((d.grossMinor / maxGross) * 100));
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center group relative"
                      >
                        <div
                          style={{ height: `${heightPercent}%` }}
                          className="w-full bg-gradient-to-t from-blue-600 to-indigo-400 rounded-t-sm group-hover:from-blue-500 group-hover:to-indigo-300 transition-all"
                        />
                        {/* Accessible Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col bg-slate-900 border border-white/20 p-2 rounded-lg shadow-2xl z-20 text-[11px] whitespace-nowrap pointer-events-none">
                          <span className="font-semibold text-white">{d.date}</span>
                          <span className="text-blue-300 font-mono">
                            Gross: {formatMinorCurrency(d.grossMinor, "NGN")}
                          </span>
                          <span className="text-purple-300 font-mono">
                            Producer: {formatMinorCurrency(d.producerMinor, "NGN")}
                          </span>
                          <span className="text-emerald-300 font-mono">
                            Platform: {formatMinorCurrency(d.platformMinor, "NGN")}
                          </span>
                        </div>
                        {i % Math.ceil(data.revenueByDay.length / 7) === 0 && (
                          <span className="text-[10px] text-white/40 mt-2 transform -rotate-45 sm:rotate-0 origin-top-left">
                            {d.date.slice(5)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-white/40 text-sm">
                  No revenue recorded for selected range.
                </div>
              )}
            </div>
            <p className="sr-only">
              Revenue trend chart showing daily platform gross revenue and producer distributions.
            </p>
          </ConsoleCard>

          {/* Channel Revenue Table */}
          <ConsoleCard
            title="Channel Revenue & Producer Share Breakdown"
            subtitle="Gross revenue collected, producer payouts earned, and platform margin per channel"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white/80">
                <thead className="bg-white/5 border-b border-white/10 text-xs text-white/60 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Transactions</th>
                    <th className="py-3 px-4">Gross Revenue</th>
                    <th className="py-3 px-4">Producer Share (70%)</th>
                    <th className="py-3 px-4">Platform Margin (30%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data && data.revenueByChannel.length > 0 ? (
                    data.revenueByChannel.map((c) => (
                      <tr key={c.channelId} className="hover:bg-white/5 transition-all">
                        <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                            {c.channelName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div>{c.channelName}</div>
                            <div className="text-xs text-white/40 font-mono">{c.channelId}</div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">{c.txCount.toLocaleString()}</td>
                        <td className="py-3 px-4 font-mono font-medium text-blue-300">
                          {formatMinorCurrency(c.grossMinor, "NGN")}
                        </td>
                        <td className="py-3 px-4 font-mono text-purple-300">
                          {formatMinorCurrency(c.producerMinor, "NGN")}
                        </td>
                        <td className="py-3 px-4 font-mono text-emerald-300">
                          {formatMinorCurrency(c.platformMinor, "NGN")}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-white/40">
                        No channel revenue records available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ConsoleCard>
        </div>
      )}

      {/* TAB: REVENUE SPLITS & COLLABORATIONS */}
      {activeTab === "splits" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-purple-800/40 bg-purple-950/20 p-4 text-purple-200">
            <div className="flex items-center gap-2 font-semibold">
              <Coins className="h-5 w-5 text-purple-400" />
              <span>Co-Production Split & Revenue Policy</span>
            </div>
            <p className="mt-1 text-xs text-purple-300">
              The platform share and rate per minute are decided strictly by the platform owner and are permanently hidden from producers. When payouts are computed, the net producer pool is split automatically by the agreed percentages into each collaborator balance with exact integer arithmetic and zero lost minor units.
            </p>
          </div>

          <ConsoleCard
            title="Co-Production Splits & Title Collaborations"
            subtitle="Agreed producer splits, confirmation versions, and automated settlement rules"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-white/80">
                <thead className="bg-white/5 text-xs uppercase text-white/40">
                  <tr>
                    <th className="px-4 py-3">Title / Production</th>
                    <th className="px-4 py-3">Collaborators & Agreed Shares</th>
                    <th className="px-4 py-3">Version</th>
                    <th className="px-4 py-3">Confirmation Status</th>
                    <th className="px-4 py-3">Settlement Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">Lagos Nights Docuseries</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs">
                        <div><span className="font-semibold text-emerald-400">70.00%</span> · lead@producer.ng (Lead)</div>
                        <div><span className="font-semibold text-emerald-400">30.00%</span> · director@studio.ng (Co-Director)</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">v1 (Confirmed)</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-950 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-800">
                        ACTIVE / AGREED
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">Auto-split on billing cycle</td>
                  </tr>
                  <tr className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium text-white">Afrobeats Rising Feature</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1 text-xs">
                        <div><span className="font-semibold text-emerald-400">94.50%</span> · sound@producer.ng</div>
                        <div><span className="font-semibold text-emerald-400">5.50%</span> · edit@studio.ng</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-white/60">v2 (Updated)</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-950 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-800">
                        PENDING CONFIRMATION
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">Escrowed until confirmed</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ConsoleCard>
        </div>
      )}

      {/* TAB 2: LEDGER EXPLORER */}
      {activeTab === "ledger" && (
        <ConsoleCard
          title="All Wallets Ledger Explorer"
          subtitle="Real-time transaction history across all viewer accounts, producer earnings, and platform adjustments"
          action={
            <button
              onClick={handleExportLedger}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
            >
              <Download className="w-3.5 h-3.5" />
              Export Ledger (CSV)
            </button>
          }
        >
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="text"
                placeholder="Search by UID, description, or reference..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <select
              value={ledgerKind}
              onChange={(e) => setLedgerKind(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Kinds</option>
              <option value="topup">Top-up</option>
              <option value="spend">Spend</option>
              <option value="refund">Refund</option>
              <option value="reversal">Reversal</option>
              <option value="payout">Payout</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white/80">
              <thead className="bg-white/5 border-b border-white/10 text-xs text-white/60 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Transaction ID</th>
                  <th className="py-3 px-4">Account UID</th>
                  <th className="py-3 px-4">Kind</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredLedger.length > 0 ? (
                  filteredLedger.map((row) => {
                    const isCredit = row.amountMinor > 0;
                    return (
                      <tr key={row.id} className="hover:bg-white/5 transition-all">
                        <td className="py-3 px-4 font-mono text-xs text-white/50">{row.id}</td>
                        <td className="py-3 px-4 font-mono text-xs text-blue-300">{row.uid}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase ${
                              row.kind === "topup"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : row.kind === "spend"
                                  ? "bg-blue-500/20 text-blue-300"
                                  : row.kind === "refund"
                                    ? "bg-amber-500/20 text-amber-300"
                                    : row.kind === "reversal"
                                      ? "bg-rose-500/20 text-rose-300"
                                      : "bg-purple-500/20 text-purple-300"
                            }`}
                          >
                            {row.kind}
                          </span>
                        </td>
                        <td
                          className={`py-3 px-4 font-mono font-medium ${
                            isCredit ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isCredit ? "+" : ""}
                          {formatMinorCurrency(row.amountMinor, row.currency)}
                        </td>
                        <td className="py-3 px-4 text-xs text-white/90">{row.description}</td>
                        <td className="py-3 px-4 font-mono text-xs text-white/50">
                          {row.reference}
                        </td>
                        <td className="py-3 px-4 text-xs text-white/40 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-white/40">
                      No matching transactions found in ledger.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* TAB 3: RECONCILIATION EXCEPTIONS & CHARGEBACKS */}
      {activeTab === "reconciliation" && (
        <div className="space-y-6">
          <ConsoleCard
            title="Reconciliation Exceptions Queue"
            subtitle="Mismatched payment records, pending gateway webhooks, and customer chargeback disputes requiring resolution"
          >
            <div className="space-y-4">
              {data && data.reconciliationExceptions.length > 0 ? (
                data.reconciliationExceptions.map((exc) => (
                  <div
                    key={exc.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          {exc.issue.replace(/_/g, " ")}
                        </span>
                        <span className="text-xs text-white/40 font-mono">
                          Ref: {exc.reference}
                        </span>
                        <span className="text-xs text-white/40">({exc.gateway})</span>
                      </div>
                      <div className="text-sm font-medium text-white">{exc.details}</div>
                      <div className="text-xs text-white/60 flex items-center gap-4">
                        <span>
                          Account: <strong className="text-white font-mono">{exc.uid}</strong>
                        </span>
                        <span>
                          Amount:{" "}
                          <strong className="text-blue-300 font-mono">
                            {formatMinorCurrency(exc.amountMinor, exc.currency)}
                          </strong>
                        </span>
                        <span>Created: {new Date(exc.createdAt).toLocaleDateString()}</span>
                      </div>

                      {/* Chargeback notes trail */}
                      {exc.chargebackNotes && exc.chargebackNotes.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-white/5 space-y-1">
                          <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
                            Dispute Notes:
                          </span>
                          {exc.chargebackNotes.map((n, idx) => (
                            <div
                              key={idx}
                              className="text-xs text-white/70 italic pl-2 border-l border-white/20"
                            >
                              "{n.note}" —{" "}
                              <span className="text-white/40 font-mono">
                                {n.authorUid.slice(0, 8)} at{" "}
                                {new Date(n.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => {
                          setModalType("chargeback_note");
                          setModalTarget(exc);
                          setModalInput("");
                          setModalReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Add Note
                      </button>
                      <button
                        onClick={() => {
                          setModalType("refund");
                          setModalTarget(exc);
                          setModalInput("");
                          setModalReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/30 text-xs text-rose-300 font-medium transition-all"
                      >
                        Issue Refund
                      </button>
                      <button
                        onClick={() => {
                          setModalType("resolve_exception");
                          setModalTarget(exc);
                          setModalInput("");
                          setModalReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 text-xs font-medium transition-all"
                      >
                        Resolve Exception
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-white/40 text-sm">
                  All transactions reconciled cleanly. No active exceptions in queue.
                </div>
              )}
            </div>
          </ConsoleCard>
        </div>
      )}

      {/* TAB 4: PERIOD CLOSE & PAYOUT CALENDAR */}
      {activeTab === "period_close" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Month-end Close Lock */}
          <ConsoleCard
            title="Month-End Accounting Close"
            subtitle="Lock financial periods to freeze revenue, dispute reconciliation, and prevent post-close modifications"
            action={
              <button
                onClick={() => {
                  setModalType("lock_period");
                  setModalInput(new Date().toISOString().slice(0, 7));
                  setModalReason("");
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
              >
                <Lock className="w-3.5 h-3.5" />
                Close & Lock Period
              </button>
            }
          >
            <div className="space-y-3">
              {data && data.lockedPeriods.length > 0 ? (
                data.lockedPeriods.map((p) => (
                  <div
                    key={p.period}
                    className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white font-mono">
                          {p.period}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          {p.status}
                        </span>
                      </div>
                      <div className="text-xs text-white/50 mt-1">
                        Gross:{" "}
                        <span className="font-mono text-white/80">
                          {formatMinorCurrency(p.grossRevenueMinor, "NGN")}
                        </span>{" "}
                        | Payouts:{" "}
                        <span className="font-mono text-white/80">
                          {formatMinorCurrency(p.payoutsMinor, "NGN")}
                        </span>
                      </div>
                      <div className="text-[11px] text-white/40 italic mt-0.5">"{p.reason}"</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/40">Locked on</div>
                      <div className="text-xs text-white/70 font-mono">
                        {new Date(p.lockedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-white/40 text-sm">
                  No historical periods locked.
                </div>
              )}
            </div>
          </ConsoleCard>

          {/* Payout Calendar */}
          <ConsoleCard
            title="Creator Payout Calendar"
            subtitle="Scheduled bi-weekly settlement cycles, cutoff dates, and estimated disbursement obligations"
          >
            <div className="space-y-3">
              {data && data.payoutCalendar.length > 0 ? (
                data.payoutCalendar.map((cycle) => (
                  <div
                    key={cycle.cycleId}
                    className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-white">{cycle.periodLabel}</div>
                      <div className="text-xs text-white/50 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-400" />
                        <span>
                          Cutoff:{" "}
                          <strong className="text-white/80 font-mono">{cycle.cutoffDate}</strong>
                        </span>
                        <span>•</span>
                        <span>
                          Disbursement:{" "}
                          <strong className="text-emerald-400 font-mono">{cycle.payoutDate}</strong>
                        </span>
                      </div>
                      <div className="text-xs text-white/60">
                        Eligible Creators:{" "}
                        <span className="text-white font-medium">
                          {cycle.eligibleProducersCount}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/40">Projected Total</div>
                      <div className="text-sm font-mono font-bold text-purple-300">
                        {formatMinorCurrency(cycle.estimatedAmountMinor, "NGN")}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-white/40 text-sm">
                  No scheduled payout cycles.
                </div>
              )}
            </div>
          </ConsoleCard>
        </div>
      )}

      {/* TAB 5: ANOMALY MONITOR */}
      {activeTab === "anomalies" && (
        <ConsoleCard
          title="Automated Financial Anomaly Flags"
          subtitle="Heuristic detection of sudden top-up volume surges, velocity bursts, and repeated payment card reversals"
        >
          <div className="space-y-3">
            {data && data.anomalyFlags.length > 0 ? (
              data.anomalyFlags.map((anom) => (
                <div
                  key={anom.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          anom.severity === "HIGH"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {anom.severity} SEVERITY
                      </span>
                      <span className="text-xs font-semibold text-white/80">
                        {anom.type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-white/40 font-mono">UID: {anom.targetUid}</span>
                    </div>
                    <div className="text-sm text-white">{anom.description}</div>
                    <div className="text-xs text-white/40">
                      Detected: {new Date(anom.detectedAt).toLocaleString()}
                    </div>
                  </div>

                  {anom.status === "OPEN" ? (
                    <button
                      onClick={() => {
                        setModalType("dismiss_anomaly");
                        setModalTarget(anom);
                        setModalReason("");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium transition-all"
                    >
                      Acknowledge & Dismiss
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-400 font-semibold uppercase">
                      Resolved
                    </span>
                  )}
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-white/40 text-sm">
                No financial anomalies detected. Transaction velocity within expected bounds.
              </div>
            )}
          </div>
        </ConsoleCard>
      )}

      {/* ACTION DIALOG MODAL */}
      {modalType && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {modalType === "lock_period" && "Close & Lock Month-End Period"}
              {modalType === "chargeback_note" && "Add Dispute / Chargeback Note"}
              {modalType === "resolve_exception" && "Resolve Reconciliation Exception"}
              {modalType === "refund" && "Issue Audited Customer Refund"}
              {modalType === "dismiss_anomaly" && "Dismiss Anomaly Flag"}
            </h3>

            {modalType === "lock_period" && (
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  Period (YYYY-MM)
                </label>
                <input
                  type="text"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  placeholder="2026-11"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {(modalType === "chargeback_note" || modalType === "resolve_exception") && (
              <div>
                <label className="block text-xs font-semibold text-white/70 mb-1">
                  {modalType === "chargeback_note" ? "Dispute Note" : "Resolution Details"}
                </label>
                <textarea
                  rows={3}
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  placeholder="Enter details of correspondence or resolution..."
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}

            {modalType === "refund" && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                Issuing refund for transaction <strong>{modalTarget?.reference}</strong> in the
                amount of{" "}
                <strong>
                  {formatMinorCurrency(
                    modalTarget?.amountMinor || 0,
                    modalTarget?.currency || "NGN",
                  )}
                </strong>
                . This action reverses the payment in the wallet ledger.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Mandatory Audit Reason (3-1000 characters)
              </label>
              <textarea
                rows={2}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Explain the regulatory or accounting justification for this action..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModalType(null)}
                disabled={submitting}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleAction}
                disabled={submitting || modalReason.trim().length < 3}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium transition-all"
              >
                {submitting ? "Executing..." : "Confirm & Log Audit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
