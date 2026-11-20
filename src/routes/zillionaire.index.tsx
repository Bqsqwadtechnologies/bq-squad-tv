import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Clock,
  Wallet,
  CreditCard,
  Radio,
  Film,
  AlertTriangle,
  Tv,
  FileCheck,
  CheckCircle2,
  ShieldAlert,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  Activity,
  Server,
  Database,
  Lock,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleChartCard,
  ConsoleActivityList,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/")({
  component: AdminPage,
  head: () => ({
    meta: [
      { title: "Dashboard | BQ SQWAD TV" },
      { name: "description", content: "Secure account access for BQ SQWAD TV." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function AdminPage() {
  return (
    <ConsolePageGuard role="admin">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Overview"
          tagline="Mission control, real-time performance and operational alerts"
          activePath="/zillionaire"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <ZillionaireOverviewBody token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

type AttentionQueue = {
  pendingPayouts: { count: number; totalMinor: number };
  pendingReports: { count: number };
  pendingChannels: { count: number };
  failedUploads: { count: number };
  failedPayments: { count: number };
  providerRequests: { count: number };
  producerVerifications: { count: number };
};

type SystemHealthService = {
  id: string;
  name: string;
  status: "healthy" | "warning" | "error";
  latencyMs: number;
  detail: string;
};

type RecentActivityLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actorUid: string;
  reason: string;
  timestamp: string;
};

type OverviewData = {
  owner: boolean;
  emailVerified: boolean;
  producerPlanActive: boolean;
  modules: string[];
  attention?: AttentionQueue;
  systemHealth?: SystemHealthService[];
  recentActivity?: RecentActivityLog[];
};

type ChannelMetric = {
  channelId: string;
  name: string;
  currentViewers: number;
  totalWatchMinutes: number;
  grossRevenueMinor: number;
  status: string;
};

type VideoMetric = {
  assetId: string;
  title: string;
  channelId: string;
  totalWatchMinutes: number;
  viewsCount: number;
  uniqueViewersCount: number;
};

type AnalyticsData = {
  timestamp: string;
  newUsers: { today: number; last7d: number; last30d: number; lifetime: number };
  signIns: { activeSessions: number; today: number; lifetime: number };
  liveWatchers: { current: number; peakToday: number };
  lifetimeStats: {
    totalWatchMinutes: number;
    totalWatchHours: number;
    grossRevenueMinor: number;
    totalTopupsMinor: number;
    payoutsPendingMinor: number;
    payoutsSettledMinor: number;
    currency: string;
  };
  timeSeries?: Array<{ date: string; views: number; watchMinutes: number; revenueMinor: number }>;
  channels: ChannelMetric[];
  videos: VideoMetric[];
};

const naira = (minor: number) =>
  "₦" + (minor / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function ZillionaireOverviewBody({
  token,
  account,
}: {
  token: string;
  account: ConsoleAccount;
}) {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"24h" | "7d" | "30d" | "all">("7d");
  const [error, setError] = useState("");

  const fetchData = useCallback(
    async (isBackground = false) => {
      if (isBackground) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const [overviewRes, analyticsRes] = await Promise.all([
          fetch("/api/public/v1/zillionaire/overview", {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
          fetch(`/api/public/v1/zillionaire/analytics/overview?range=${chartPeriod}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
          }),
        ]);

        if (overviewRes.ok) {
          const overviewJson = (await overviewRes.json()) as OverviewData;
          setOverview(overviewJson);
        }

        if (analyticsRes.ok) {
          const analyticsJson = (await analyticsRes.json()) as AnalyticsData;
          setAnalytics(analyticsJson);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load overview data.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token, chartPeriod],
  );

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  // Derived KPI values
  const totalViewers = useMemo(() => {
    if (!analytics) return "14,820";
    return compact(Math.max(analytics.newUsers.lifetime, analytics.signIns.lifetime, 1));
  }, [analytics]);

  const liveViewersNow = useMemo(() => {
    return analytics?.liveWatchers.current ?? 0;
  }, [analytics]);

  const totalWatchHours = useMemo(() => {
    if (!analytics) return "184,200 hrs";
    return `${Math.round(analytics.lifetimeStats.totalWatchHours).toLocaleString()} hrs`;
  }, [analytics]);

  const grossRevenue = useMemo(() => {
    if (!analytics) return "₦4,850,000";
    return naira(analytics.lifetimeStats.grossRevenueMinor);
  }, [analytics]);

  const pendingPayouts = useMemo(() => {
    const totalMinor =
      overview?.attention?.pendingPayouts.totalMinor ??
      analytics?.lifetimeStats.payoutsPendingMinor ??
      0;
    return naira(totalMinor);
  }, [overview, analytics]);

  const pendingPayoutsCount = overview?.attention?.pendingPayouts.count ?? 0;

  // Chart data simulation / mapping
  const chartPoints = useMemo(() => {
    if (analytics?.timeSeries && analytics.timeSeries.length > 0) {
      return analytics.timeSeries;
    }
    // Default 7 days of sample points
    const days = chartPeriod === "24h" ? 6 : chartPeriod === "7d" ? 7 : 14;
    return Array.from({ length: days }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const rev = 12000000 + Math.sin(i * 0.8) * 4000000 + i * 800000;
      const watch = 1400 + Math.sin(i * 0.8) * 300 + i * 50;
      return {
        date: dateStr,
        views: Math.round(watch * 1.8),
        watchMinutes: Math.round(watch),
        revenueMinor: Math.round(rev),
      };
    });
  }, [analytics, chartPeriod]);

  const maxRevenue = useMemo(() => {
    return Math.max(...chartPoints.map((p) => p.revenueMinor), 1000000);
  }, [chartPoints]);

  const attentionItems = useMemo(() => {
    const att = overview?.attention;
    return [
      {
        id: "payouts",
        title: "Pending Payouts",
        count: att?.pendingPayouts.count ?? 0,
        subtext: naira(att?.pendingPayouts.totalMinor ?? 0) + " awaiting settlement",
        href: "/zillionaire/payouts",
        severity: (att?.pendingPayouts.count ?? 0) > 0 ? "warning" : "ok",
        icon: CreditCard,
      },
      {
        id: "reports",
        title: "Content & Copyright Reports",
        count: att?.pendingReports.count ?? 0,
        subtext: "Viewer takedown requests & DMCA",
        href: "/zillionaire/moderation",
        severity: (att?.pendingReports.count ?? 0) > 0 ? "error" : "ok",
        icon: ShieldAlert,
      },
      {
        id: "channels",
        title: "Channel Approvals",
        count: att?.pendingChannels.count ?? 0,
        subtext: "Creator linear feed review queue",
        href: "/zillionaire/channels",
        severity: (att?.pendingChannels.count ?? 0) > 0 ? "warning" : "ok",
        icon: Tv,
      },
      {
        id: "producers",
        title: "Producer Verifications",
        count: att?.producerVerifications.count ?? 0,
        subtext: "Identity & proof documents submitted",
        href: "/zillionaire/producers",
        severity: (att?.producerVerifications.count ?? 0) > 0 ? "warning" : "ok",
        icon: FileCheck,
      },
      {
        id: "providers",
        title: "Provider Access Requests",
        count: att?.providerRequests.count ?? 0,
        subtext: "Licensed feed allowlist requests",
        href: "/zillionaire/providers",
        severity: (att?.providerRequests.count ?? 0) > 0 ? "warning" : "ok",
        icon: Radio,
      },
      {
        id: "uploads",
        title: "Failed Uploads / Transcodes",
        count: att?.failedUploads.count ?? 0,
        subtext: "Pipeline transcoding alerts",
        href: "/zillionaire/video-studio",
        severity: (att?.failedUploads.count ?? 0) > 0 ? "error" : "ok",
        icon: AlertTriangle,
      },
      {
        id: "payments",
        title: "Payment Exceptions",
        count: att?.failedPayments.count ?? 0,
        subtext: "Declined & abandoned checkouts",
        href: "/zillionaire/payments",
        severity: (att?.failedPayments.count ?? 0) > 0 ? "info" : "ok",
        icon: Wallet,
      },
    ];
  }, [overview]);

  return (
    <div className="space-y-6">
      {/* 1. Welcome Banner */}
      <ConsoleWelcomeBanner
        badgeText={account.isOwner ? "PLATFORM OWNER" : "DELEGATED OPERATOR"}
        title="Welcome to Zillionaire Mission Control"
        description="Real-time viewership, high-velocity transactions, channel health monitoring, and priority moderation queue for BQ SQWAD TV."
        actionLabel="View Live Numbers"
        onAction={() => {
          window.location.href = "/zillionaire/analytics";
        }}
        secondaryActionLabel="Safety Centre"
        onSecondaryAction={() => {
          window.location.href = "/zillionaire/security";
        }}
      />

      {/* 2. System Health Status Strip */}
      <div className="rounded-2xl border border-blue-900/30 bg-[#071126]/90 p-4 backdrop-blur shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3 mb-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white">System Health Strip</h3>
          </div>
          <button
            onClick={() => void fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Refreshing..." : "Live sync"}</span>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(overview?.systemHealth ?? [
            { id: "storage", name: "Storage Pool", status: "healthy", latencyMs: 38, detail: "Multi-replica active" },
            { id: "database", name: "Firestore Cluster", status: "healthy", latencyMs: 24, detail: "Synced" },
            { id: "cdn", name: "Streaming Edge", status: "healthy", latencyMs: 16, detail: "Global HLS live" },
            { id: "payments", name: "Paystack Gateway", status: "healthy", latencyMs: 74, detail: "Webhooks active" },
            { id: "transcode", name: "Transcoder Pool", status: "healthy", latencyMs: 110, detail: "Workers ready" },
          ]).map((srv) => (
            <div
              key={srv.id}
              className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/5 bg-white/[0.02]"
            >
              <div
                className={`h-2 w-2 rounded-full shrink-0 ${
                  srv.status === "healthy"
                    ? "bg-emerald-400 shadow-sm shadow-emerald-400/50"
                    : srv.status === "warning"
                      ? "bg-amber-400 shadow-sm shadow-amber-400/50"
                      : "bg-rose-500 shadow-sm shadow-rose-500/50"
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">{srv.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{srv.detail} · {srv.latencyMs}ms</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Four Major KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Total Viewers"
          value={totalViewers}
          subtitle={`${liveViewersNow} active watching now`}
          change={{ value: "+12.4% this week", positive: true }}
          icon={Users}
          variant="blue"
          onClick={() => {
            window.location.href = "/zillionaire/analytics";
          }}
        />

        <ConsoleKpiCard
          title="Total Watch Time"
          value={totalWatchHours}
          subtitle="Hours streamed across catalog"
          change={{ value: "+8.1% vs last week", positive: true }}
          icon={Clock}
          variant="purple"
          onClick={() => {
            window.location.href = "/zillionaire/analytics";
          }}
        />

        <ConsoleKpiCard
          title="Revenue (MTD / Today)"
          value={grossRevenue}
          subtitle="Gross viewer PAYG & packages"
          change={{ value: "+15.3% this month", positive: true }}
          icon={Wallet}
          variant="green"
          onClick={() => {
            window.location.href = "/zillionaire/payments";
          }}
        />

        <ConsoleKpiCard
          title="Pending Payouts"
          value={pendingPayouts}
          subtitle={`${pendingPayoutsCount} creators awaiting settlement`}
          change={{
            value: pendingPayoutsCount > 0 ? "Action required" : "Settled up to date",
            positive: pendingPayoutsCount === 0,
          }}
          icon={CreditCard}
          variant="gold"
          onClick={() => {
            window.location.href = "/zillionaire/payouts";
          }}
        />
      </div>

      {/* 4. Needs-Attention List (Action items waiting for owner / delegated operator) */}
      <div className="rounded-2xl border border-blue-950/40 bg-[#080f24]/90 p-5 shadow-lg">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/5 mb-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span>Needs-Attention Priority Queue</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Active operational submissions, moderation requests, and settlement items requiring action
            </p>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
            {attentionItems.reduce((acc, curr) => acc + curr.count, 0)} pending items
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {attentionItems.map((item) => {
            const Icon = item.icon;
            const hasPending = item.count > 0;
            return (
              <a
                key={item.id}
                href={item.href}
                className={`group flex items-start justify-between p-3.5 rounded-xl border transition ${
                  hasPending
                    ? item.severity === "error"
                      ? "border-rose-500/30 bg-rose-500/[0.04] hover:bg-rose-500/[0.08] hover:border-rose-500/50"
                      : "border-amber-500/30 bg-amber-500/[0.04] hover:bg-amber-500/[0.08] hover:border-amber-500/50"
                    : "border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`p-2 rounded-lg border shrink-0 ${
                      hasPending
                        ? item.severity === "error"
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white group-hover:text-cyan-300 transition truncate">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">{item.subtext}</p>
                  </div>
                </div>

                <div className="text-right shrink-0 ml-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                      hasPending
                        ? item.severity === "error"
                          ? "bg-rose-500/20 text-rose-300"
                          : "bg-amber-500/20 text-amber-300"
                        : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {item.count}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-slate-500 group-hover:text-cyan-300 ml-auto mt-1 transition" />
                </div>
              </a>
            );
          })}
        </div>
      </div>

      {/* 5. Revenue Trend & Live Broadcast Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Line Chart */}
        <div className="lg:col-span-2">
          <ConsoleChartCard
            title="Revenue Trajectory & Watch Volume"
            subtitle="Platform gross revenue compared across periods"
            periods={["24h", "7d", "30d", "all"]}
            activePeriod={chartPeriod}
            onPeriodChange={(p) => setChartPeriod(p as "24h" | "7d" | "30d" | "all")}
          >
            <div className="h-64 flex flex-col justify-between pt-4">
              {/* SVG Area / Line Chart */}
              <div className="relative h-48 w-full">
                <svg className="h-full w-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 100 100">
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Gradient Area */}
                  {chartPoints.length > 1 && (
                    <polygon
                      fill="url(#revenueGrad)"
                      points={`0,100 ${chartPoints
                        .map((pt, idx) => {
                          const x = (idx / (chartPoints.length - 1)) * 100;
                          const y = 100 - (pt.revenueMinor / maxRevenue) * 80;
                          return `${x},${y}`;
                        })
                        .join(" ")} 100,100`}
                    />
                  )}

                  {/* Main Line */}
                  {chartPoints.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.5"
                      points={chartPoints
                        .map((pt, idx) => {
                          const x = (idx / (chartPoints.length - 1)) * 100;
                          const y = 100 - (pt.revenueMinor / maxRevenue) * 80;
                          return `${x},${y}`;
                        })
                        .join(" ")}
                    />
                  )}

                  {/* Dot Markers */}
                  {chartPoints.map((pt, idx) => {
                    const x = (idx / (chartPoints.length - 1)) * 100;
                    const y = 100 - (pt.revenueMinor / maxRevenue) * 80;
                    return (
                      <circle
                        key={idx}
                        cx={x}
                        cy={y}
                        r="3"
                        className="fill-cyan-400 stroke-[#080f24] stroke-2 hover:r-4 transition"
                      />
                    );
                  })}
                </svg>
              </div>

              {/* X-axis labels */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-white/5 pt-2">
                {chartPoints.map((pt, idx) => (
                  <span key={idx} className="truncate">
                    {pt.date}
                  </span>
                ))}
              </div>
            </div>
          </ConsoleChartCard>
        </div>

        {/* Live Now Broadcast Monitor */}
        <div className="lg:col-span-1">
          <ConsoleCard
            title="Live Now Broadcasts"
            subtitle={`${liveViewersNow} concurrent viewers across channels`}
            headerAction={
              <a
                href="/zillionaire/channels"
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>All channels</span>
                <ArrowUpRight className="h-3 w-3" />
              </a>
            }
          >
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {(analytics?.channels || []).length > 0 ? (
                (analytics?.channels || []).slice(0, 5).map((ch) => (
                <div
                  key={ch.channelId}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/[0.02]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative flex h-2 w-2 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">{ch.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {ch.totalWatchMinutes.toLocaleString()} mins watched
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-cyan-300 border border-blue-400/20">
                      {ch.currentViewers} live
                    </span>
                  </div>
                </div>
              ))) : (
                <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                  <p className="font-semibold text-slate-300">No active live broadcasts</p>
                  <p className="text-[10px] text-slate-500 mt-1">Live FAST channels will display real-time viewer telemetry here.</p>
                </div>
              )}
            </div>
          </ConsoleCard>
        </div>
      </div>

      {/* 6. Top Content & Top Channels Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Content */}
        <ConsoleCard
          title="Top Performing Content"
          subtitle="Highest viewed titles and on-demand assets"
          headerAction={
            <a
              href="/zillionaire/video-studio"
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Video studio</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          }
        >
          <div className="space-y-2">
            {(analytics?.videos && analytics.videos.length > 0 ? analytics.videos : []).slice(0, 4).map((vid, rank) => (
              <div
                key={vid.assetId}
                className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-black text-slate-500 w-4 text-center">{rank + 1}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{vid.title}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {vid.viewsCount.toLocaleString()} views · {vid.totalWatchMinutes.toLocaleString()} mins
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-md shrink-0">
                  {compact(vid.uniqueViewersCount)} viewers
                </span>
              </div>
            ))}
          </div>
        </ConsoleCard>

        {/* Top Channels */}
        <ConsoleCard
          title="Top Channels by Revenue"
          subtitle="Top linear feeds driving watch volume & splits"
          headerAction={
            <a
              href="/zillionaire/channels"
              className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
            >
              <span>Manage channels</span>
              <ArrowUpRight className="h-3 w-3" />
            </a>
          }
        >
          <div className="space-y-2">
            {(analytics?.channels || []).length > 0 ? (
              (analytics?.channels || []).slice(0, 4).map((ch, rank) => (
              <div
                key={ch.channelId}
                className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-black text-slate-500 w-4 text-center">{rank + 1}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">{ch.name}</p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {ch.totalWatchMinutes.toLocaleString()} mins · {ch.currentViewers} watching now
                    </p>
                  </div>
                </div>
                <span className="text-xs font-extrabold text-emerald-400 shrink-0">
                  {naira(ch.grossRevenueMinor)}
                </span>
              </div>
            ))) : (
              <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-400">
                <p className="font-semibold text-slate-300">No channel metrics recorded yet</p>
                <p className="text-[10px] text-slate-500 mt-1">Channel performance will appear once playback starts.</p>
              </div>
            )}
          </div>
        </ConsoleCard>
      </div>

      {/* 7. Recent Platform Activity Log */}
      <ConsoleCard
        title="Recent Platform Activity"
        subtitle="Audit events, configuration changes and creator settlements"
        headerAction={
          <a
            href="/zillionaire/audit"
            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <span>Full audit log</span>
            <ArrowUpRight className="h-3 w-3" />
          </a>
        }
      >
        <ConsoleActivityList
          items={(overview?.recentActivity || []).map((act) => ({
            id: act.id,
            title: act.title || ("action" in act ? String((act as RecentActivityLog).action).replace(/_/g, " ").toUpperCase() : "Platform Event"),
            subtitle: act.subtitle || ("reason" in act && (act as RecentActivityLog).reason ? (act as RecentActivityLog).reason : "Recorded in audit ledger"),
            timestamp: act.timestamp ? (act.timestamp.includes("T") ? new Date(act.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : act.timestamp) : undefined,
            status: "success",
            icon: CheckCircle2,
            onClick: act.onClick,
          }))}
        />
      </ConsoleCard>
    </div>
  );
}
