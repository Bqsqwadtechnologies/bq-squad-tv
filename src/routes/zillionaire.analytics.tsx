import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Eye, Clock, Wallet, Radio, Download, ChevronRight, RefreshCw } from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleChartCard,
  ConsoleTable,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/analytics")({
  component: ZillionaireAnalyticsRoute,
  head: () => ({
    meta: [
      { title: "Numbers | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type Channel = {
  channelId: string;
  name: string;
  currentViewers: number;
  totalWatchMinutes: number;
  grossRevenueMinor: number;
};
type Video = {
  assetId: string;
  title: string;
  channelId: string;
  totalWatchMinutes: number;
  viewsCount: number;
  uniqueViewersCount: number;
};
type Data = {
  liveWatchers: { current: number; peakToday: number };
  period: {
    views: number;
    watchMinutes: number;
    revenueMinor: number;
    viewsChangePct: number;
    watchChangePct: number;
    revenueChangePct: number;
  };
  timeSeries: { date: string; views: number; watchMinutes: number; revenueMinor: number }[];
  topCountries: { code: string; views: number }[];
  channels: Channel[];
  videos: Video[];
};

const naira = (minor: number) =>
  "₦" + (minor / 100).toLocaleString("en-NG", { maximumFractionDigits: 0 });
const compact = (n: number) =>
  Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const pctText = (n: number) => `${n >= 0 ? "+" : ""}${n}% vs previous period`;

function csv(name: string, rows: Record<string, string | number>[]) {
  const firstRow = rows[0];
  if (!firstRow) return;
  const keys = Object.keys(firstRow);
  const body = [keys.join(","), ...rows.map((r) => keys.map((k) => JSON.stringify(r[k] ?? "")).join(","))];
  const url = URL.createObjectURL(new Blob([body.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ZillionaireAnalyticsRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="overview">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Numbers"
          tagline="Views, watch time and revenue per channel and video"
          activePath="/zillionaire/analytics"
          account={{ email: account.email || undefined, isOwner: account.isOwner, modules: account.modules }}
          onLock={onLock}
        >
          <AnalyticsBody token={token} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

function AnalyticsBody({ token }: { token: string }) {
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [channelId, setChannelId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/public/v1/zillionaire/analytics/overview?range=${range}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Could not load numbers.");
      setData((await res.json()) as Data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load numbers.");
    } finally {
      setLoading(false);
    }
  }, [range, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const videos = useMemo(
    () => (data?.videos ?? []).filter((v) => !channelId || v.channelId === channelId),
    [data, channelId],
  );
  const maxViews = Math.max(1, ...(data?.timeSeries.map((d) => d.views) ?? [1]));
  const selected = data?.channels.find((c) => c.channelId === channelId);

  if (error)
    return (
      <ConsoleCard title="Numbers unavailable">
        <p className="text-xs text-slate-300">{error}</p>
        <button onClick={() => void load()} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white">
          Retry
        </button>
      </ConsoleCard>
    );

  return (
    <>
      <ConsoleWelcomeBanner
        title="Numbers for every channel and video"
        description="Live viewers, watch time and revenue. Tap a channel to see its videos."
        badgeText="Analytics"
        actionLabel="Refresh"
        onAction={() => void load()}
      />
      {loading || !data ? (
        <ConsoleCard loading>{null}</ConsoleCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ConsoleKpiCard title="Live viewers now" value={compact(data.liveWatchers.current)} subtitle={`Peak today ${compact(data.liveWatchers.peakToday)}`} icon={Radio} variant="blue" />
            <ConsoleKpiCard title="Views" value={compact(data.period.views)} change={{ value: pctText(data.period.viewsChangePct), positive: data.period.viewsChangePct >= 0 }} icon={Eye} variant="purple" />
            <ConsoleKpiCard title="Watch time (min)" value={compact(data.period.watchMinutes)} change={{ value: pctText(data.period.watchChangePct), positive: data.period.watchChangePct >= 0 }} icon={Clock} variant="green" />
            <ConsoleKpiCard title="Revenue" value={naira(data.period.revenueMinor)} change={{ value: pctText(data.period.revenueChangePct), positive: data.period.revenueChangePct >= 0 }} icon={Wallet} variant="gold" />
          </div>

          <ConsoleChartCard
            title="Views per day"
            subtitle="Compared with the previous period in the KPI cards"
            periods={["24h", "7d", "30d", "all"]}
            activePeriod={range}
            onPeriodChange={setRange}
          >
            <div className="flex h-40 items-end gap-1" role="img" aria-label={`Views per day, total ${data.period.views}, peak ${maxViews}`}>
              {data.timeSeries.map((d) => (
                <div key={d.date} title={`${d.date}: ${d.views} views`} className="flex-1 rounded-t bg-gradient-to-t from-blue-700 to-blue-400" style={{ height: `${Math.max(3, (d.views / maxViews) * 100)}%` }} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              {data.period.views} views, peak day {maxViews}. Top countries:{" "}
              {data.topCountries.map((c) => `${c.code} ${c.views}`).join(", ") || "no data yet"}.
            </p>
          </ConsoleChartCard>

          <ConsoleCard
            title="Channels"
            subtitle="Tap a row to see its videos"
            headerAction={
              <button
                onClick={() =>
                  csv("channels.csv", data.channels.map((c) => ({ channel: c.name, liveViewers: c.currentViewers, watchMinutes: c.totalWatchMinutes, revenueNaira: c.grossRevenueMinor / 100 })))
                }
                className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-200"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            }
          >
            <ConsoleTable
              columns={[
                { key: "name", label: "Channel" },
                { key: "live", label: "Live now" },
                { key: "minutes", label: "Watch min" },
                { key: "revenue", label: "Revenue" },
                { key: "go", label: "" },
              ]}
              data={data.channels.map((c) => ({
                id: c.channelId,
                name: c.name,
                live: c.currentViewers,
                minutes: compact(c.totalWatchMinutes),
                revenue: naira(c.grossRevenueMinor),
                go: <ChevronRight className="h-4 w-4 text-slate-400" />,
              }))}
              onRowClick={(r) => setChannelId(String(r.id))}
              emptyTitle="No channels yet"
              emptyDescription="Numbers appear here once channels have viewers."
            />
          </ConsoleCard>

          <ConsoleCard
            title={selected ? `Videos in ${selected.name}` : "All videos"}
            headerAction={
              <div className="flex gap-2">
                {channelId && (
                  <button onClick={() => setChannelId("")} className="rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-200">
                    All channels
                  </button>
                )}
                <button
                  onClick={() => csv("videos.csv", videos.map((v) => ({ video: v.title, views: v.viewsCount, uniqueViewers: v.uniqueViewersCount, watchMinutes: v.totalWatchMinutes })))}
                  className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-200"
                >
                  <Download className="h-3.5 w-3.5" /> CSV
                </button>
                <button onClick={() => void load()} aria-label="Refresh" className="rounded-xl border border-white/10 p-1.5 text-slate-200">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            }
          >
            <ConsoleTable
              columns={[
                { key: "title", label: "Video" },
                { key: "views", label: "Views" },
                { key: "unique", label: "Unique viewers" },
                { key: "minutes", label: "Watch min" },
              ]}
              data={videos.map((v) => ({
                id: v.assetId,
                title: v.title,
                views: compact(v.viewsCount),
                unique: compact(v.uniqueViewersCount),
                minutes: compact(v.totalWatchMinutes),
              }))}
              emptyTitle="No videos yet"
              emptyDescription="Videos appear here after their first view."
            />
          </ConsoleCard>
        </>
      )}
    </>
  );
}
