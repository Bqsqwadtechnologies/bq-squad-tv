import { computeDelta } from "@/lib/delta";
import { ProducerKycFlow } from "@/components/ProducerKycFlow";
import { getNextPayoutWindow } from "@/lib/payout-calendar";
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
  ShieldCheck, Shield, Lock, AlertTriangle, CheckCircle2,
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
    settledAt?: string | null;
    settlementReference?: string | null;
  }>;
  reservedPayoutsByCurrency?: Record<string, number>;
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
  const payoutWindow = getNextPayoutWindow();
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [showKycModal, setShowKycModal] = useState<boolean>(false);
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
        delta: computeDelta(summary.earningsBalanceMinor, summary.previousEarningsBalanceMinor, "last period"),
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

        {/* KYC Verification Status Banner */}
        <section id="verification" className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                summary?.producerStatus === "APPROVED"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : summary?.producerStatus === "PENDING"
                  ? "bg-amber-500/20 text-amber-400"
                  : "bg-cyan-500/20 text-cyan-400"
              }`}>
                {summary?.producerStatus === "APPROVED" ? (
                  <BadgeCheck className="h-6 w-6" />
                ) : summary?.producerStatus === "PENDING" ? (
                  <Clock className="h-6 w-6" />
                ) : (
                  <ShieldCheck className="h-6 w-6" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white">Identity & Payout Verification</h3>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    summary?.producerStatus === "APPROVED"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : summary?.producerStatus === "PENDING"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-slate-800 text-slate-300"
                  }`}>
                    {summary?.producerStatus === "APPROVED"
                      ? "Verified"
                      : summary?.producerStatus === "PENDING"
                      ? "Under Compliance Review"
                      : "Verification Required"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {summary?.producerStatus === "APPROVED"
                    ? "Your identity is verified. Royalty payouts are active for your registered settlement account."
                    : summary?.producerStatus === "PENDING"
                    ? "Your verification documents are being reviewed by compliance. Payouts unlock upon approval."
                    : "Complete country-first identity verification and phone OTP to unlock earnings and payout distributions."}
                </p>
              </div>
            </div>

            {summary?.producerStatus !== "APPROVED" && (
              <button
                type="button"
                onClick={() => setShowKycModal(true)}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-[#031039] transition hover:bg-cyan-400 shadow-md"
              >
                {summary?.producerStatus === "PENDING" ? "Update Verification" : "Start Country-First Verification →"}
              </button>
            )}
          </div>
        </section>

        {/* KYC Modal Overlay */}
        {showKycModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative my-8 w-full max-w-2xl">
              <ProducerKycFlow
                authToken={token}
                onCancel={() => setShowKycModal(false)}
                onSuccess={() => {
                  setShowKycModal(false);
                  void load(token);
                }}
              />
            </div>
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
            caption={summary ? `${summary.publishedChannelCount} active` : undefined}
            icon={Tv}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Live Viewers"
            value={analytics ? analytics.liveViewers.toLocaleString() : "—"}
            subtitle="Real-time concurrent audience"
            delta={computeDelta(analytics?.liveViewers, analytics?.previousLiveViewers, "last period")}
            icon={Radio}
            variant="purple"
          />
          <ConsoleKpiCard
            title="Watch Time"
            value={analytics ? `${analytics.totalWatchHours} hrs` : "—"}
            subtitle={analytics ? `${analytics.totalMinutesWatched} total minutes` : "Across all content"}
            delta={computeDelta(analytics?.totalWatchHours, analytics?.previousWatchHours, "last period")}
            icon={Clock}
            variant="gold"
          />
          <ConsoleKpiCard
            title="Estimated Earnings"
            value={summary ? money(summary.earningsBalanceMinor, summary.currency) : "—"}
            subtitle={summary ? `Lifetime: ${money(summary.earningsLifetimeMinor, summary.currency)}` : "Net revenue"}
            delta={computeDelta(summary?.earningsBalanceMinor, summary?.previousEarningsBalanceMinor, "last period")}
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
                  No data yet. Streaming telemetry will appear once viewers watch your channels.
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
        <div id="uploads" className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl">
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
                {(analytics?.topContent || []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-xs text-slate-500">
                      No content items yet. Upload a movie or series to begin streaming.
                    </td>
                  </tr>
                )}
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

          <section id="schedule" className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
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
            <a
              href="/payment-and-payout-policy"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 shrink-0 self-start sm:self-center"
            >
              <span>Disbursement Policy</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>

        {/* Producer Earnings & Payouts Hub */}
        <div id="earnings" className="pt-2 space-y-6">
          {/* Calm Trust Notice Banner */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07143d] px-4 py-3.5 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <Shield className="h-4 w-4 text-cyan-400 shrink-0" />
              <span>Your payout details are encrypted and protected.</span>
            </div>
            <a
              href="/help/data-protection"
              className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
            >
              <span>Learn more</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Earnings KPI Cards & Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Available Balance</span>
              <p className="mt-2 font-mono text-2xl font-black text-white">
                {summary ? money(summary.earningsBalanceMinor, summary.currency) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Minimum payout is $500. Payments are made by bank wire transfer.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Reserved / In Payout</span>
              <p className="mt-2 font-mono text-2xl font-black text-amber-300">
                {summary && earnings?.reservedPayoutsByCurrency
                  ? money(earnings.reservedPayoutsByCurrency[summary.currency] || 0, summary.currency)
                  : money(0, summary?.currency || "USD")}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Held during settlement processing
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Lifetime Net Earnings</span>
              <p className="mt-2 font-mono text-2xl font-black text-emerald-400">
                {summary ? money(summary.earningsLifetimeMinor, summary.currency) : "—"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                Total net distributions accumulated
              </p>
            </div>
          </div>

          {/* Payout Account Management Section */}
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-cyan-400" />
                  <span>Settlement Bank Account</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Disbursements are made by bank wire transfer to your verified settlement account.
                </p>
              </div>
              <div>
                {isKycComplete ? (
                  <button
                    onClick={() => {
                      const el = document.getElementById("payout-account-form");
                      if (el) el.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition"
                  >
                    <span>Manage Payout Account</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowKycModal(true)}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-white/10 transition"
                  >
                    <Lock className="h-3.5 w-3.5" />
                    <span>Locked — Verify Identity First</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Payout History Table */}
          <div className="rounded-2xl border border-white/10 bg-[#07143d] p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-cyan-400" />
              <span>Payout History</span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-white/10 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="py-3 px-3">Date Requested</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">Method</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Reference</th>
                    <th className="py-3 px-3 text-right">Settled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {!earnings?.payouts || earnings.payouts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        No payout requests recorded. Minimum payout is $500. Payments are made by bank wire transfer.
                      </td>
                    </tr>
                  ) : (
                    earnings.payouts.map((po) => (
                      <tr key={po.id} className="hover:bg-white/[0.02]">
                        <td className="py-3.5 px-3 text-slate-300">
                          {po.createdAt ? new Date(po.createdAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-white">
                          {money(po.amountMinor, po.currency)}
                        </td>
                        <td className="py-3.5 px-3 text-slate-400">Bank wire transfer</td>
                        <td className="py-3.5 px-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                            po.status === "PAID"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : po.status === "REJECTED"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : po.status === "HELD"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                          }`}>
                            {po.status === "PAID" ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            {po.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-300">
                          {po.settlementReference || "—"}
                        </td>
                        <td className="py-3.5 px-3 text-right text-slate-400">
                          {po.settledAt ? new Date(po.settledAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Monthly Settlement Statements */}
          <StatementsSettlementView
            mode="producer"
            title="Producer Monthly Settlement Statements"
            kycApproved={isKycComplete}
            statements={[
              {
                id: "stmt_prod_2026_03",
                period: "March 2026",
                status: "Processing",
                currency: summary?.currency || "USD",
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
