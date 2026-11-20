import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  Plus,
  Radio,
  RefreshCw,
  Tv,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

type Programme = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  description?: string;
  ageRating?: string;
};

type LiveChannel = {
  id: string;
  title: string;
  handle: string;
  description: string;
  logoUrl: string | null;
  streamUrl: string;
  failoverStreamUrl: string;
  category: string;
  language: string;
  ageRating: string;
  paid: boolean;
  ratePerMinuteMinor: number;
  currency: string;
  isLive: boolean;
  streamStatus: string;
  submissionStatus: string;
  submittedBy: string;
  type: string;
  viewerCount: number;
  playbackHealth: {
    bitrateMbps: number;
    bufferingPct: number;
    errorRatePct: number;
    status: string;
    failoverActive: boolean;
    lastCheckedAt: string;
  } | null;
  expiryDate: string | null;
  expiryWarning: string;
  approvalStatus?: string;
  rightsEvidence?: { licenceNumber?: string; licenceContractUrl?: string; territories?: string[] } | null;
  scheduledStartAt?: string | null;
  epgProgrammes: Programme[];
};

type NewChannel = {
  name: string;
  handle: string;
  description: string;
  streamUrl: string;
  failoverStreamUrl: string;
  category: string;
  language: string;
  ageRating: string;
  paid: boolean;
  ratePerMinuteMinor: number;
  expiryDate: string;
};

const EMPTY_FORM: NewChannel = {
  name: "",
  handle: "",
  description: "",
  streamUrl: "",
  failoverStreamUrl: "",
  category: "Entertainment",
  language: "en",
  ageRating: "PG",
  paid: false,
  ratePerMinuteMinor: 0,
  expiryDate: "",
};

export const Route = createFileRoute("/zillionaire/live-tv")({
  component: ZillionaireLiveTvRoute,
  head: () => ({
    meta: [
      { title: "Live TV | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireLiveTvRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="channels"
      title="Live TV"
      description="Create live channels, manage programme listings, review submissions and monitor playback status."
    >
      {(token, account, onLock) => (
        <LiveTvPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function LiveTvPage({
  token,
  account,
  onLock,
}: {
  token: string;
  account: any;
  onLock: () => void;
}) {
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "live">("all");
  const [programmeDrafts, setProgrammeDrafts] = useState<Record<string, string>>({});

  const authHeaders = useCallback(async () => {
    const headers = await getWebAuthHeaders();
    return { ...headers, authorization: `Bearer ${token}` };
  }, [token]);

  const loadChannels = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/public/v1/zillionaire/live-channels/", { headers });
      if (!response.ok) throw new Error("Live channel data could not be loaded.");
      const data = await response.json();
      setChannels(data.channels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Live channel data could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  const filteredChannels = useMemo(() => {
    if (activeTab === "pending") return channels.filter((c) => c.submissionStatus === "PENDING_APPROVAL");
    if (activeTab === "live") return channels.filter((c) => c.isLive);
    return channels;
  }, [channels, activeTab]);

  const stats = useMemo(() => ({
    total: channels.length,
    live: channels.filter((c) => c.isLive).length,
    pending: channels.filter((c) => c.submissionStatus === "PENDING_APPROVAL").length,
    viewers: channels.reduce((sum, c) => sum + c.viewerCount, 0),
  }), [channels]);

  const act = async (payload: Record<string, unknown>) => {
    setBusy(true);
    setFeedback(null);
    try {
      const headers = await authHeaders();
      const response = await fetch("/api/public/v1/zillionaire/live-channels/", {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The action could not be completed.");
      setFeedback("Live TV settings saved.");
      await loadChannels(true);
      return data;
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "The action could not be completed.");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createChannel = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name || !form.streamUrl.trim()) return;
    const data = await act({
      action: "CREATE_LIVE_CHANNEL",
      ...form,
      name,
      handle: form.handle || undefined,
      logoUrl: undefined,
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : undefined,
      reason: "Owner-created live channel",
    });
    if (data?.success) {
      setShowCreate(false);
      setForm(EMPTY_FORM);
    }
  };

  const toggleLive = async (channel: LiveChannel) => {
    const verb = channel.isLive ? "end" : "start";
    if (!window.confirm(`Confirm ${verb} live for “${channel.title}”?`)) return;
    await act({
      action: channel.isLive ? "END_LIVE" : "GO_LIVE",
      channelId: channel.id,
      confirmation: true,
      reason: channel.isLive ? "Owner ended live broadcast" : "Owner started live broadcast",
    });
  };

  const saveProgrammes = async (channel: LiveChannel) => {
    let programmes: Programme[];
    try {
      programmes = JSON.parse(programmeDrafts[channel.id] || JSON.stringify(channel.epgProgrammes));
      if (!Array.isArray(programmes)) throw new Error("Programme guide must be a list.");
    } catch {
      setFeedback("Programme guide entries are not valid. Check the list format and try again.");
      return;
    }
    const ok = await act({
      action: "UPDATE_PROGRAMME_GUIDE",
      channelId: channel.id,
      programmes,
      reason: "Owner updated live channel programme guide",
    });
    if (ok) setProgrammeDrafts((current) => ({ ...current, [channel.id]: JSON.stringify(programmes, null, 2) }));
  };

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Live TV"
      subtitle="Create channels, edit programme guides, approve submissions and keep broadcasts healthy."
      account={account}
      onLock={onLock}
      activePath="/zillionaire/live-tv"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Live channel control"
          subtitle="Manage HLS sources, programme listings, approvals and live broadcast status."
        />

        {feedback && (
          <div className="flex items-center justify-between rounded-lg border border-cyan-800 bg-cyan-950/50 p-3 text-sm text-cyan-100" role="status">
            <span className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4" />{feedback}</span>
            <button onClick={() => setFeedback(null)} aria-label="Dismiss message"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <ConsoleKpiCard title="Live Channels" value={String(stats.live)} change="Currently marked live" icon={<Radio className="h-5 w-5" />} color="green" />
          <ConsoleKpiCard title="All Channels" value={String(stats.total)} change="Live listings" icon={<Tv className="h-5 w-5" />} color="blue" />
          <ConsoleKpiCard title="Needs Approval" value={String(stats.pending)} change="Provider submissions" icon={<Clock3 className="h-5 w-5" />} color="gold" />
          <ConsoleKpiCard title="Live Viewers" value={stats.viewers.toLocaleString()} change="Active channel sessions" icon={<Users className="h-5 w-5" />} color="purple" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {([
              ["all", "All channels"],
              ["pending", "Needs approval"],
              ["live", "Live now"],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`rounded-lg px-3 py-2 text-sm ${activeTab === key ? "bg-cyan-600 text-white" : "border border-slate-700 bg-slate-900 text-slate-300"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => void loadChannels(true)} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200" disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
            </button>
            <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500">
              <Plus className="h-4 w-4" /> Create live channel
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-100">
            <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> Could not load live channels</div>
            <p className="mt-2 text-sm text-red-200">{error}</p>
            <button onClick={() => void loadChannels()} className="mt-3 rounded-lg border border-red-800 px-3 py-2 text-sm">Retry</button>
          </div>
        )}

        {loading ? (
          <ConsoleCard title="Live channel directory">
            <div className="space-y-3 p-5" aria-label="Loading live channels">
              {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-800" />)}
            </div>
          </ConsoleCard>
        ) : !error && filteredChannels.length === 0 ? (
          <ConsoleCard title="Live channel directory">
            <div className="p-10 text-center text-slate-300">
              <Tv className="mx-auto mb-3 h-8 w-8 text-slate-500" />
              <p className="font-semibold">No channels in this view</p>
              <p className="mt-1 text-sm text-slate-400">Create a live channel or choose another filter.</p>
              <button onClick={() => setShowCreate(true)} className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Create live channel</button>
            </div>
          </ConsoleCard>
        ) : (
          <div className="space-y-4">
            {filteredChannels.map((channel) => (
              <ConsoleCard key={channel.id} title={channel.title}>
                <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                        {channel.logoUrl ? <img src={channel.logoUrl} alt="" className="h-full w-full object-cover" /> : <Tv className="h-5 w-5 text-cyan-300" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 font-semibold text-white">
                          {channel.title}
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            channel.approvalStatus === "live" || channel.isLive ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700" :
                            channel.approvalStatus === "scheduled" ? "bg-purple-900/60 text-purple-300 border border-purple-700" :
                            channel.approvalStatus === "approved" ? "bg-sky-900/60 text-sky-300 border border-sky-700" :
                            channel.approvalStatus === "suspended" ? "bg-amber-950 text-amber-300 border border-amber-800" :
                            channel.approvalStatus === "rejected" ? "bg-rose-950 text-rose-300 border border-rose-800" :
                            channel.approvalStatus === "submitted" || channel.submissionStatus === "PENDING_APPROVAL" ? "bg-yellow-950 text-yellow-300 border border-yellow-800" :
                            "bg-slate-800 text-slate-300"
                          }`}>
                            {channel.approvalStatus ? channel.approvalStatus.toUpperCase() : channel.streamStatus}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">{channel.handle} · {channel.category} · {channel.language} · {channel.ageRating}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-300"><Users className="h-4 w-4" />{channel.viewerCount.toLocaleString()} viewers</div>
                    </div>
                    <p className="text-sm text-slate-400">{channel.description || "No channel description provided."}</p>
                    <div className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs sm:grid-cols-2">
                      <p className="truncate"><span className="text-slate-500">Primary HLS:</span> <span className="text-slate-300">{channel.streamUrl || "Not configured"}</span></p>
                      <p className="truncate"><span className="text-slate-500">Failover HLS:</span> <span className="text-slate-300">{channel.failoverStreamUrl || "Not configured"}</span></p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${channel.playbackHealth.status === "healthy" ? "bg-emerald-950 text-emerald-300" : channel.playbackHealth.status === "degraded" ? "bg-amber-950 text-amber-300" : "bg-red-950 text-red-300"}`}>
                        {channel.playbackHealth?.status === "healthy" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                        Playback {channel.playbackHealth?.status || "unknown"}
                      </span>
                      {channel.playbackHealth ? <>
                        <span className="text-slate-400">{channel.playbackHealth.bitrateMbps} Mbps</span>
                        <span className="text-slate-400">{channel.playbackHealth.bufferingPct}% buffering</span>
                        <span className="text-slate-400">{channel.playbackHealth.errorRatePct}% errors</span>
                        {channel.playbackHealth.failoverActive && <span className="text-amber-300">Failover active</span>}
                      </> : <span className="text-slate-500">No health report recorded</span>}
                      {channel.expiryWarning !== "none" && <span className="text-amber-300">Expiry: {channel.expiryWarning.replaceAll("_", " ")}</span>}
                    </div>
                    {channel.submissionStatus === "PENDING_APPROVAL" && (
                      <div className="flex flex-wrap gap-2 rounded-lg border border-amber-900 bg-amber-950/30 p-3">
                        <span className="mr-auto flex items-center gap-2 text-sm text-amber-200">{channel.type} submission from {channel.submittedBy}</span>
                        <button onClick={() => void act({ action: "APPROVE_SUBMISSION", channelId: channel.id, reason: "Live channel submission reviewed and approved" })} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Approve</button>
                        <button onClick={() => {
                          const rejectionReason = window.prompt("Reason for rejection?");
                          if (rejectionReason?.trim()) void act({ action: "REJECT_SUBMISSION", channelId: channel.id, rejectionReason, reason: "Live channel submission reviewed and rejected" });
                        }} className="rounded-lg border border-red-800 px-3 py-2 text-xs font-semibold text-red-200">Reject</button>
                      </div>
                    )}
                    {channel.rightsEvidence && (
                      <div className="rounded border border-slate-800 bg-slate-900/40 p-2 text-xs text-slate-300">
                        <span className="font-semibold text-slate-400">Rights verification:</span> {channel.rightsEvidence.licenceNumber ? `Licence #${channel.rightsEvidence.licenceNumber}` : "Documentation attached"}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => void toggleLive(channel)} disabled={busy || channel.approvalStatus === "submitted" || channel.approvalStatus === "rejected" || channel.approvalStatus === "suspended"} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${channel.isLive ? "bg-amber-700 hover:bg-amber-600" : "bg-emerald-700 hover:bg-emerald-600"}`}>
                        {busy && <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />}{channel.isLive ? "End live" : "Go live"}
                      </button>
                      {(channel.isLive || channel.streamStatus === "LIVE") && (
                        <button onClick={() => {
                          const reason = window.prompt("Reason for emergency force stop?");
                          if (reason?.trim()) void act({ action: "FORCE_STOP", channelId: channel.id, reason });
                        }} disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
                          Force stop
                        </button>
                      )}
                      {channel.approvalStatus === "approved" && (
                        <button onClick={() => {
                          const scheduledStartAt = window.prompt("Scheduled start time (ISO string)?", new Date().toISOString());
                          if (scheduledStartAt?.trim()) void act({ action: "SCHEDULE_LIVE", channelId: channel.id, scheduledStartAt: scheduledStartAt.trim(), reason: "Scheduled broadcast" });
                        }} disabled={busy} className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-600">
                          Schedule broadcast
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div><h3 className="font-semibold text-white">Programme guide</h3><p className="text-xs text-slate-500">Edit scheduled listings for this channel.</p></div>
                      <span className="text-xs text-slate-400">{channel.epgProgrammes.length} entries</span>
                    </div>
                    <div className="mb-3 space-y-2">
                      {channel.epgProgrammes.map((programme) => (
                        <div key={programme.id} className="flex gap-3 rounded-lg bg-slate-900 p-2.5 text-sm">
                          <span className="min-w-[90px] font-mono text-cyan-300">{programme.startAt}–{programme.endAt}</span>
                          <span className="text-slate-200">{programme.title}</span>
                        </div>
                      ))}
                      {channel.epgProgrammes.length === 0 && <p className="text-sm text-slate-500">No programme entries yet.</p>}
                    </div>
                    <details className="group">
                      <summary className="cursor-pointer text-xs font-semibold text-cyan-300">Edit programme guide</summary>
                      <textarea
                        value={programmeDrafts[channel.id] ?? JSON.stringify(channel.epgProgrammes, null, 2)}
                        onChange={(event) => setProgrammeDrafts((current) => ({ ...current, [channel.id]: event.target.value }))}
                        rows={8}
                        className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        aria-label={`Programme guide for ${channel.title}`}
                      />
                      <button onClick={() => void saveProgrammes(channel)} disabled={busy} className="mt-2 rounded-lg border border-cyan-700 px-3 py-2 text-xs font-semibold text-cyan-200 disabled:opacity-50">Save guide</button>
                    </details>
                  </div>
                </div>
              </ConsoleCard>
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-live-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between"><div><h2 id="create-live-title" className="text-xl font-bold text-white">Create live channel</h2><p className="mt-1 text-sm text-slate-400">Register a channel and configure its HLS sources.</p></div><button onClick={() => setShowCreate(false)} aria-label="Close" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"><X className="h-5 w-5" /></button></div>
            <form onSubmit={(event) => void createChannel(event)} className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Channel name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Handle<input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} placeholder="@channel" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Primary HLS stream URL<input required type="url" value={form.streamUrl} onChange={(e) => setForm({ ...form, streamUrl: e.target.value })} placeholder="https://…/index.m3u8" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300 sm:col-span-2">Failover HLS stream URL<input type="url" value={form.failoverStreamUrl} onChange={(e) => setForm({ ...form, failoverStreamUrl: e.target.value })} placeholder="Optional backup stream" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Language<input value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="text-sm text-slate-300">Age rating<select value={form.ageRating} onChange={(e) => setForm({ ...form, ageRating: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white">{["G", "PG", "13+", "16+", "18+"].map((rating) => <option key={rating}>{rating}</option>)}</select></label>
              <label className="text-sm text-slate-300">Rights expiry<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>
              <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2"><input type="checkbox" checked={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.checked })} /> Paid per minute</label>
              {form.paid && <label className="text-sm text-slate-300">Price per minute (minor units)<input type="number" min="1" value={form.ratePerMinuteMinor} onChange={(e) => setForm({ ...form, ratePerMinuteMinor: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2.5 text-white" /></label>}
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-4 sm:col-span-2"><button type="button" onClick={() => setShowCreate(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button><button disabled={busy} type="submit" className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Create channel"}</button></div>
            </form>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
