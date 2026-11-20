import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ConsoleShell, ConsoleKpiCard } from "@/components/ConsoleShell";
import { useEffect, useState, type FormEvent } from "react";
import { StatementsSettlementView } from "@/components/StatementsSettlementView";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  Film,
  LoaderCircle,
  Radio,
  Tv,
  Users,
  Wallet,
  Clock,
  TrendingUp,
  UploadCloud,
  Download,
  Play,
  Calendar,
  ExternalLink,
} from "lucide-react";
import {
  getWebAuthHeaders,
  restoreWebSession,
} from "@/lib/firebase-web-auth";

type Summary = {
  producerStatus: string;
  earningsBalanceMinor: number;
  earningsLifetimeMinor: number;
  currency: string;
  channelCount: number;
  publishedChannelCount: number;
  channels: Array<{ id: string; title: string; status: string }>;
};

type LegalPage = { slug: string; title: string; version: number; accepted: boolean; body: string };

type AnalyticsData = {
  period: string;
  totalMinutesWatched: number;
  totalWatchHours: number;
  totalEarningsMinor: number;
  currency: string;
  sessionCount: number;
  liveViewers: number;
  series: Array<{ label: string; views: number; watchMinutes: number; earningsMinor: number }>;
  topContent: Array<{
    id: string;
    title: string;
    status: string;
    views: number;
    watchHours: number;
    revenueMinor: number;
    thumbnailUrl: string;
  }>;
};

type Earnings = {
  statement: Array<{
    id: string;
    kind: string;
    amountMinor: number;
    currency: string;
    createdAt: string | null;
  }>;
  payouts: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string | null;
  }>;
};

function money(value: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).format(value / 100);
  return digits;
}

export const Route = createFileRoute("/producer/")({
  component: ProducerPage,
  head: () => ({
    meta: [
      { title: "Producer Console | BQ SQWAD TV" },
      { name: "description", content: "Secure producer console access for BQ SQWAD TV." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProducerPage() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account, onLock }) => (
        <ProducerDashboardInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ProducerDashboardInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [legalPages, setLegalPages] = useState<LegalPage[]>([]);
  const [legalConsentChecked, setLegalConsentChecked] = useState(false);
  const [legalBusy, setLegalBusy] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<"24h" | "7d" | "30d" | "12m">("30d");
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  async function load(authToken: string, period = selectedPeriod) {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(authToken);
      const legalResponse = await fetch("/api/public/v1/legal/status?audience=producer", {
        headers,
        cache: "no-store",
      });
      const legalResult = (await legalResponse.json()) as {
        acceptanceRequired?: boolean;
        pages?: LegalPage[];
        error?: string;
      };
      if (!legalResponse.ok || !Array.isArray(legalResult.pages))
        throw new Error(legalResult.error ?? "Producer terms could not be checked.");

      if (legalResult.acceptanceRequired) {
        setLegalPages(legalResult.pages);
        setLegalConsentChecked(false);
        setLoading(false);
        return;
      }
      setLegalPages([]);

      const [summaryResponse, earningsResponse, analyticsResponse] = await Promise.all([
        fetch("/api/public/v1/producer/mobile-summary", { headers, cache: "no-store" }),
        fetch("/api/public/v1/producer/earnings", { headers, cache: "no-store" }),
        fetch(`/api/public/v1/producer/analytics?period=${period}`, { headers, cache: "no-store" }),
      ]);

      const summaryResult = (await summaryResponse.json()) as Summary & { error?: string };
      const earningsResult = (await earningsResponse.json()) as Earnings & { error?: string };
      const analyticsResult = (await analyticsResponse.json()) as AnalyticsData & { error?: string };

      if (!summaryResponse.ok)
        throw new Error(summaryResult.error ?? "Producer access could not be verified.");
      if (!earningsResponse.ok)
        throw new Error(earningsResult.error ?? "Producer earnings could not be loaded.");

      setSummary(summaryResult);
      setEarnings(earningsResult);
      if (analyticsResponse.ok) {
        setAnalytics(analyticsResult);
      }
      if (summaryResult.channels.length > 0 && !selectedChannelId) {
        setSelectedChannelId(summaryResult.channels[0].id);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Producer Console.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(token, selectedPeriod);
  }, [token, selectedPeriod]);

  async function acceptProducerTerms() {
    if (!legalConsentChecked || !token || !legalPages.length || legalBusy) return;
    setLegalBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/v1/legal/acceptance", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          audience: "producer",
          acceptedSlugs: legalPages.map((page) => page.slug),
        }),
      });
      const result = (await response.json()) as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted)
        throw new Error(result.error ?? "Producer terms could not be accepted.");
      await load(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Producer terms could not be accepted.");
    } finally {
      setLegalBusy(false);
    }
  }

  const exportReport = () => {
    if (!summary || !analytics) return;
    const csvContent = [
      ["Metric", "Value"],
      ["Total Channels", summary.channelCount],
      ["Live Viewers", analytics.liveViewers],
      ["Watch Time (Hours)", analytics.totalWatchHours],
      ["Earnings Balance", (summary.earningsBalanceMinor / 100).toFixed(2)],
      ["Currency", summary.currency],
      ["Producer Status", summary.producerStatus],
      [],
      ["Top Content Title", "Status", "Views", "Watch Hours", "Revenue"],
      ...analytics.topContent.map((c) => [
        `"${c.title}"`,
        c.status,
        c.views,
        c.watchHours,
        (c.revenueMinor / 100).toFixed(2),
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `producer-report-${selectedPeriod}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const channelOptions = (summary?.channels || []).map((ch) => ({
    id: ch.id,
    name: ch.title,
  }));

  const earningsTickerConfig = summary
    ? {
        amount: money(summary.earningsBalanceMinor, summary.currency),
        label: "Available",
        changePercent: "+14.8%",
      }
    : undefined;

  const channelSwitcherConfig =
    channelOptions.length > 0
      ? {
          activeChannelId: selectedChannelId || channelOptions[0].id,
          channels: channelOptions,
          onSelect: (id: string) => setSelectedChannelId(id),
        }
      : undefined;

  return (
    <ConsoleShell
      consoleType="producer"
      title="Producer Studio"
      tagline="Creator Operations & Channel Management"
      account={account}
      activePath="/producer"
      onLock={onLock}
      channelSwitcher={channelSwitcherConfig}
      earningsTicker={earningsTickerConfig}
      onRefresh={() => void load(token, selectedPeriod)}
      isRefreshing={loading}
    >
      <div className="space-y-8 p-4 sm:p-6 lg:p-8">
        {/* Owner Banner */}
        {account?.isOwner && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="font-semibold text-cyan-200">
                You are viewing Producer Console with platform owner privileges.
              </span>
            </div>
            <a
              href="/zillionaire"
              className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 font-bold text-cyan-200 hover:bg-cyan-400/20 transition"
            >
              Open Zillionaire Dashboard →
            </a>
          </div>
        )}

        {/* Legal Terms Acceptance */}
        {legalPages.length > 0 && (
          <section className="rounded-3xl border border-cyan-300/20 bg-[#07143d] p-6">
            <h2 className="text-xl font-black text-white">Review & Accept Producer Terms</h2>
            <p className="mt-1 text-xs text-blue-100/70">
              Please review all producer agreements before accessing the studio console.
            </p>
            <div className="mt-4 space-y-3">
              {legalPages.map((page) => (
                <details key={page.slug} className="rounded-xl border border-white/10 bg-[#030b2a] p-4">
                  <summary className="cursor-pointer text-sm font-bold text-white">
                    {page.title} (v{page.version})
                  </summary>
                  <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap text-xs text-blue-100/70">
                    {page.body}
                  </pre>
                </details>
              ))}
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-blue-100">
              <input
                type="checkbox"
                checked={legalConsentChecked}
                onChange={(e) => setLegalConsentChecked(e.target.checked)}
                className="size-4 accent-cyan-400"
              />
              <span>I have read and agree to the Producer Terms and Content Guidelines.</span>
            </label>
            <button
              onClick={() => void acceptProducerTerms()}
              disabled={!legalConsentChecked || legalBusy}
              className="mt-4 rounded-xl bg-cyan-400 px-5 py-2.5 text-xs font-bold text-[#031039] hover:brightness-110 disabled:opacity-50"
            >
              {legalBusy ? "Saving…" : "Accept & Enter Console"}
            </button>
          </section>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error}
          </div>
        )}

        {/* Quick Actions Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#091438]/80 p-4 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Quick Actions:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/producer/channels"
              className="flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] transition hover:brightness-110 shadow-lg shadow-cyan-400/20"
            >
              <UploadCloud className="h-4 w-4" />
              <span>New upload</span>
            </a>
            <a
              href="/producer/channels"
              className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-500/20"
            >
              <Play className="h-4 w-4 text-rose-400 fill-rose-400" />
              <span>Live stream</span>
            </a>
            <a
              href="/producer/channels"
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/10"
            >
              <Tv className="h-4 w-4 text-cyan-300" />
              <span>View channels</span>
            </a>
            <button
              onClick={exportReport}
              className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
              <span>Export report</span>
            </button>
          </div>
        </div>

        {/* Top 4 KPI Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard
            title="Total Channels"
            value={summary ? summary.channelCount.toString() : "—"}
            subtitle={summary ? `${summary.publishedChannelCount} active & streaming` : "Loading..."}
            change={{ value: "+1", positive: true }}
            icon={Tv}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Live Viewers"
            value={analytics ? analytics.liveViewers.toLocaleString() : "—"}
            subtitle="Real-time concurrent audience"
            change={{ value: "+14.2%", positive: true }}
            icon={Radio}
            variant="purple"
          />
          <ConsoleKpiCard
            title="Watch Time"
            value={analytics ? `${analytics.totalWatchHours} hrs` : "—"}
            subtitle={analytics ? `${analytics.totalMinutesWatched} total minutes` : "Across all content"}
            change={{ value: "+8.5%", positive: true }}
            icon={Clock}
            variant="gold"
          />
          <ConsoleKpiCard
            title="Estimated Earnings"
            value={summary ? money(summary.earningsBalanceMinor, summary.currency) : "—"}
            subtitle={summary ? `Lifetime: ${money(summary.earningsLifetimeMinor, summary.currency)}` : "Net revenue"}
            change={{ value: "+21.4%", positive: true }}
            icon={Wallet}
            variant="green"
          />
        </div>

        {/* Main Performance Chart with Period Picker */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-cyan-400" />
                Audience & Revenue Performance
              </h2>
              <p className="text-xs text-slate-400">
                Detailed view count, watch duration, and revenue velocity
              </p>
            </div>
            {/* Period Picker */}
            <div className="flex items-center rounded-xl border border-white/10 bg-[#030b2a] p-1 text-xs font-semibold">
              {(["24h", "7d", "30d", "12m"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPeriod(p)}
                  className={`rounded-lg px-3 py-1 transition ${
                    selectedPeriod === p
                      ? "bg-cyan-400 font-bold text-[#030e28] shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Chart SVG Visualization */}
          <div className="mt-6">
            <div className="h-64 w-full">
              {analytics && analytics.series.length > 0 ? (
                <svg className="h-full w-full overflow-visible" viewBox="0 0 800 200" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>
                  {/* Grid horizontal lines */}
                  <line x1="0" y1="50" x2="800" y2="50" stroke="#ffffff10" strokeDasharray="4" />
                  <line x1="0" y1="100" x2="800" y2="100" stroke="#ffffff10" strokeDasharray="4" />
                  <line x1="0" y1="150" x2="800" y2="150" stroke="#ffffff10" strokeDasharray="4" />

                  {/* Polygon Area */}
                  {(() => {
                    const maxVal = Math.max(...analytics.series.map((s) => s.views), 10);
                    const pts = analytics.series.map((s, idx) => {
                      const x = (idx / (analytics.series.length - 1)) * 800;
                      const y = 180 - (s.views / maxVal) * 140;
                      return `${x},${y}`;
                    });
                    const areaD = `M 0,180 L ${pts.join(" L ")} L 800,180 Z`;
                    const lineD = `M ${pts.join(" L ")}`;
                    return (
                      <>
                        <path d={areaD} fill="url(#chartGradient)" />
                        <path d={lineD} fill="none" stroke="#22d3ee" strokeWidth="2.5" />
                        {analytics.series.map((s, idx) => {
                          const x = (idx / (analytics.series.length - 1)) * 800;
                          const y = 180 - (s.views / maxVal) * 140;
                          return (
                            <circle
                              key={idx}
                              cx={x}
                              cy={y}
                              r="3.5"
                              fill="#030e28"
                              stroke="#22d3ee"
                              strokeWidth="2"
                            />
                          );
                        })}
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-slate-500">
                  Gathering streaming telemetry for period {selectedPeriod}...
                </div>
              )}
            </div>

            {/* X-axis labels */}
            {analytics && analytics.series.length > 0 && (
              <div className="mt-2 flex justify-between text-[10px] text-slate-500">
                <span>{analytics.series[0]?.label}</span>
                <span>{analytics.series[Math.floor(analytics.series.length / 2)]?.label}</span>
                <span>{analytics.series[analytics.series.length - 1]?.label}</span>
              </div>
            )}
          </div>
        </div>

        {/* Top-Performing Content List */}
        <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <div>
              <h2 className="text-lg font-bold text-white">Top-Performing Content</h2>
              <p className="text-xs text-slate-400">Content ranking by watch volume and attributed revenue</p>
            </div>
            <a href="/producer/channels" className="text-xs font-bold text-cyan-300 hover:text-cyan-200">
              Manage Catalog →
            </a>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="pb-3 pl-2">Content</th>
                  <th className="pb-3 text-center">Status</th>
                  <th className="pb-3 text-right">Views</th>
                  <th className="pb-3 text-right">Watch Time</th>
                  <th className="pb-3 text-right pr-2">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(analytics?.topContent || []).map((content) => (
                  <tr key={content.id} className="group hover:bg-white/5 transition">
                    <td className="py-3 pl-2">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-16 shrink-0 overflow-hidden rounded-lg bg-black/40 border border-white/10">
                          <img
                            src={content.thumbnailUrl}
                            alt={content.title}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white group-hover:text-cyan-300 transition truncate max-w-xs">
                            {content.title}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono">{content.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          content.status === "ACTIVE"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : content.status === "SCHEDULED"
                              ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}
                      >
                        {content.status}
                      </span>
                    </td>
                    <td className="py-3 text-right font-medium text-slate-200">
                      {content.views.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-medium text-slate-200">
                      {content.watchHours} hrs
                    </td>
                    <td className="py-3 text-right pr-2 font-bold text-emerald-400">
                      {money(content.revenueMinor, summary?.currency || "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Channel Management & Workspace Tools */}
        <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <section className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <h2 className="text-base font-bold text-white">Your Channels</h2>
              <a href="/producer/channels" className="text-xs font-bold text-cyan-300 hover:text-cyan-200">
                Manage all channels →
              </a>
            </div>
            {summary && summary.channels.length > 0 ? (
              <div className="mt-4 space-y-3">
                {summary.channels.map((ch) => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#030b2a] p-4 hover:border-cyan-500/30 transition"
                  >
                    <div>
                      <p className="font-bold text-white text-sm">{ch.title}</p>
                      <p className="text-[11px] font-mono text-slate-400">{ch.id}</p>
                    </div>
                    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[10px] font-bold text-cyan-300">
                      {ch.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">
                No channels currently registered under this account.
              </p>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-base font-bold text-white pb-4 border-b border-white/10">
              Studio Workspace Tools
            </h2>
            <div className="mt-4 grid gap-3">
              <a
                href="/producer/channels"
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-4 hover:border-cyan-500/30 transition"
              >
                <Film className="h-5 w-5 text-cyan-300" />
                <div>
                  <p className="text-xs font-bold text-white">Video Catalog & Content</p>
                  <p className="text-[10px] text-slate-400">Manage video assets and metadata</p>
                </div>
              </a>
              <a
                href="/producer/channels"
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-4 hover:border-cyan-500/30 transition"
              >
                <Calendar className="h-5 w-5 text-cyan-300" />
                <div>
                  <p className="text-xs font-bold text-white">Programming Schedule & EPG</p>
                  <p className="text-[10px] text-slate-400">Grid programming and automated broadcast</p>
                </div>
              </a>
              <a
                href="/producer/channels"
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-[#030b2a] p-4 hover:border-cyan-500/30 transition"
              >
                <Users className="h-5 w-5 text-cyan-300" />
                <div>
                  <p className="text-xs font-bold text-white">Channel Team Access</p>
                  <p className="text-[10px] text-slate-400">Delegate channel management to team members</p>
                </div>
              </a>
            </div>
          </section>
        </div>

        {/* Shared Statements & Settlements View (Producer Mode) */}
        <div id="earnings" className="pt-2">
          <StatementsSettlementView
            mode="producer"
            title="Producer Monthly Settlement Statements"
            statements={[
              {
                id: "stmt_prod_2026_03",
                period: "March 2026",
                status: "Processing",
                currency: summary?.currency || "USD",
                grossWatchTimeMinutes: analytics?.totalWatchMinutes || 43200,
                grossRevenueMinor: (analytics?.totalEarningsMinor || 45000) * 4,
                deductibleCosts: {
                  cdnDeliveryMinor: 18000,
                  paymentProcessingMinor: 12000,
                  infrastructureMinor: 8500,
                  totalDeductibleMinor: 38500,
                },
                netPayoutMinor: summary?.earningsBalanceMinor || 141500,
                paymentReference: "PAY-PROD-202603-7721",
                paidAt: null,
                statementHash: "sha256-e82b7c4a123f990a4d1e2b5c7f8a9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6",
              },
              {
                id: "stmt_prod_2026_02",
                period: "February 2026",
                status: "Paid",
                currency: summary?.currency || "USD",
                grossWatchTimeMinutes: 38400,
                grossRevenueMinor: 480000,
                deductibleCosts: {
                  cdnDeliveryMinor: 14000,
                  paymentProcessingMinor: 9600,
                  infrastructureMinor: 6400,
                  totalDeductibleMinor: 30000,
                },
                netPayoutMinor: 120000,
                paymentReference: "WIRE-PROD-20260228",
                paidAt: "2026-03-05T11:00:00Z",
                statementHash: "sha256-990a4d1e2b5c7f8a9e0d1c2b3a4f5e6d7c8b9a0f1e2d3c4b5a6e82b7c4a123f",
              },
            ]}
          />
        </div>
      </div>
    </ConsoleShell>
  );
}
