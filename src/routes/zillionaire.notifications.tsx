import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  Send,
  Calendar,
  Users,
  Smartphone,
  Mail,
  Sliders,
  CheckCircle2,
  Clock,
  XCircle,
  FileText,
  Download,
  Eye,
  RefreshCw,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleTable,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/notifications")({
  component: ZillionaireNotificationsRoute,
  head: () => ({
    meta: [
      { title: "Notifications & Communication | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type Campaign = {
  id: string;
  title: string;
  body: string;
  targetType: "all" | "segment" | "single";
  segment: string;
  channels: ("push" | "in_app" | "email")[];
  status: "sent" | "scheduled" | "cancelled" | "draft";
  scheduledFor: string | null;
  createdAt: string;
  sentCount: number;
  deliveredCount: number;
  openedCount: number;
  failedCount: number;
  openRatePct: number;
};

type Template = {
  id: string;
  name: string;
  category: string;
  title: string;
  body: string;
  variables: string[];
  channels: string[];
  systemTrigger: string;
};

type NotificationsPayload = {
  campaigns: Campaign[];
  stats: {
    totalBroadcasts: number;
    totalSent: number;
    totalDelivered: number;
    totalOpened: number;
    totalFailed: number;
    deliveryRatePct: number;
    openRatePct: number;
  };
  templates: Template[];
  deliveryRules: {
    quietHoursStart: string;
    quietHoursEnd: string;
    timeZone: string;
    defaultFrequencyCap: number;
    fcmStatus: string;
    emailGatewayStatus: string;
  };
};

const AUDIENCE_SEGMENTS = [
  { id: "all_ng", label: "🇳🇬 Nigeria Viewers", description: "All active viewers located in Nigeria" },
  { id: "all_gh", label: "🇬🇭 Ghana Viewers", description: "All active viewers located in Ghana" },
  { id: "diaspora", label: "🌍 Diaspora (UK / US / Canada)", description: "Viewers in international diaspora regions" },
  { id: "channel_followers", label: "⭐ Channel Followers", description: "Viewers who follow one or more channels" },
  { id: "wallet_low", label: "⚠️ Low Wallet Balance (< ₦500)", description: "Active viewers with under ₦500 wallet balance" },
  { id: "wallet_high", label: "💎 High Value Wallets (> ₦5,000)", description: "Subscribers and frequent spenders" },
  { id: "inactive_30d", label: "💤 Inactive 30+ Days", description: "Viewers who haven't opened the app in 30 days" },
  { id: "new_this_week", label: "🎉 New Viewers This Week", description: "Recently registered viewers in past 7 days" },
];

function ZillionaireNotificationsRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="notifications">
      {({ token, onLock }) => <NotificationsDashboard token={token} {...(onLock ? { onLock } : {})} />}
    </ConsolePageGuard>
  );
}

function NotificationsDashboard({ token, onLock }: { token: string; onLock?: () => void }) {
  const [data, setData] = useState<NotificationsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"compose" | "history" | "templates" | "rules">("compose");

  // Compose State
  const [targetType, setTargetType] = useState<"all" | "segment" | "single">("all");
  const [selectedSegment, setSelectedSegment] = useState(AUDIENCE_SEGMENTS[0]?.label ?? "");
  const [singleRecipient, setSingleRecipient] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<("push" | "in_app" | "email")[]>(["push", "in_app"]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [sendTiming, setSendTiming] = useState<"now" | "schedule">("now");
  const [scheduleDate, setScheduleDate] = useState("");
  const [quietHours, setQuietHours] = useState(true);
  const [frequencyCap, setFrequencyCap] = useState(3);
  const [auditReason, setAuditReason] = useState("");
  const [previewChannel, setPreviewChannel] = useState<"push" | "in_app" | "email">("push");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // History Filter
  const [historyFilter, setHistoryFilter] = useState<string>("all");
  const [historySearch, setHistorySearch] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/notifications", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as NotificationsPayload;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Apply template
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (!templateId || !data) return;
    const tpl = data.templates.find((t) => t.id === templateId);
    if (tpl) {
      setTitle(tpl.title);
      setBody(tpl.body);
    }
  };

  const insertVariable = (varName: string) => {
    setBody((prev) => `${prev} {{${varName}}}`);
  };

  const handleChannelToggle = (channel: "push" | "in_app" | "email") => {
    setSelectedChannels((prev) =>
      prev.includes(channel) ? (prev.length > 1 ? prev.filter((c) => c !== channel) : prev) : [...prev, channel]
    );
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !auditReason.trim()) {
      setFeedbackMessage({ text: "Please provide a Title, Message, and Audit Reason.", type: "error" });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);

    const idempotencyKey = crypto.randomUUID();
    const scheduledFor =
      sendTiming === "schedule" && scheduleDate ? new Date(scheduleDate).toISOString() : null;

    try {
      const payload = {
        action: "broadcast",
        idempotencyKey,
        targetType,
        segment: targetType === "segment" ? selectedSegment : targetType === "all" ? "All Viewers" : undefined,
        recipientUid: targetType === "single" ? singleRecipient.trim() : undefined,
        title: title.trim(),
        body: body.trim(),
        deepLink: deepLink.trim() || undefined,
        channels: selectedChannels,
        scheduledFor,
        quietHours,
        frequencyCap,
        templateId: selectedTemplate || undefined,
        reason: auditReason.trim(),
      };

      const res = await fetch("/api/public/v1/zillionaire/notifications", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      setFeedbackMessage({
        text: sendTiming === "schedule" ? "Broadcast successfully scheduled!" : "Broadcast sent successfully!",
        type: "success",
      });

      // Reset form
      setTitle("");
      setBody("");
      setAuditReason("");
      setDeepLink("");
      setSelectedTemplate("");
      void fetchData();
    } catch (err) {
      setFeedbackMessage({
        text: err instanceof Error ? err.message : "Failed to dispatch notification",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelCampaign = async (campaignId: string) => {
    if (!confirm("Are you sure you want to cancel this scheduled notification?")) return;
    try {
      const res = await fetch("/api/public/v1/zillionaire/notifications", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          campaignId,
          reason: "Cancelled by Zillionaire owner in console",
        }),
      });
      if (res.ok) {
        void fetchData();
      }
    } catch {
      // Ignored
    }
  };

  const filteredCampaigns = useMemo(() => {
    if (!data) return [];
    return data.campaigns.filter((c) => {
      if (historyFilter !== "all" && c.status !== historyFilter) return false;
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        return c.title.toLowerCase().includes(q) || c.segment.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data, historyFilter, historySearch]);

  const exportCsv = () => {
    if (!filteredCampaigns.length) return;
    const headers = ["Title", "Target", "Channels", "Status", "Date", "Sent", "Delivered", "Opened", "Failed", "OpenRate%"];
    const rows = filteredCampaigns.map((c) => [
      `"${c.title.replace(/"/g, '""')}"`,
      `"${c.segment}"`,
      c.channels.join("+"),
      c.status,
      c.createdAt,
      c.sentCount,
      c.deliveredCount,
      c.openedCount,
      c.failedCount,
      c.openRatePct,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bq-broadcasts-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Preview replacement dummy text
  const previewText = useMemo(() => {
    let t = title || "Title preview";
    let b = body || "Message body will appear here...";
    const sampleVals: Record<string, string> = {
      name: "Tunde",
      walletBalance: "2,450",
      channelName: "Nollywood Prime",
      actionUrl: "https://tv.bqsqwad.com/watch",
      amount: "45,000",
      bankName: "Zenith Bank (****4321)",
      seriesTitle: "Lagos Hustlers",
      episodeNumber: "4",
      title: "The Lagos Heist",
      reason: "Needs age advisory badge",
      replierName: "Amina K.",
      replySnippet: "Totally agree with this scene!",
    };
    for (const [k, v] of Object.entries(sampleVals)) {
      t = t.replaceAll(`{{${k}}}`, v);
      b = b.replaceAll(`{{${k}}}`, v);
    }
    return { title: t, body: b };
  }, [title, body]);

  return (
    <ConsoleShell consoleType="zillionaire" title="Notifications & Communication" tagline="Multi-channel broadcasts, scheduling, and automated messaging" activePath="/zillionaire/notifications" {...(onLock ? { onLock } : {})}>
      <ConsoleWelcomeBanner
        title="Notifications & Communication"
        description="Broadcast announcements, engage segmented viewer cohorts, schedule alerts and monitor multi-channel delivery"
        actionLabel="Send Broadcast"
        onAction={() => setActiveTab("compose")}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ConsoleKpiCard
          title="Total Broadcasts"
          value={data?.stats.totalBroadcasts ?? "—"}
          subtitle="+12% this month"
          icon={Bell}
          variant="blue"
        />
        <ConsoleKpiCard
          title="Total Notifications Sent"
          value={data?.stats.totalSent ? (data.stats.totalSent > 10000 ? `${(data.stats.totalSent / 1000).toFixed(1)}K` : data.stats.totalSent) : "—"}
          subtitle="+8.4% reach"
          icon={Send}
          variant="purple"
        />
        <ConsoleKpiCard
          title="Delivery Success Rate"
          value={data?.stats.deliveryRatePct ? `${data.stats.deliveryRatePct}%` : "—"}
          subtitle="FCM & Email Active"
          icon={CheckCircle2}
          variant="green"
        />
        <ConsoleKpiCard
          title="Average Open Rate"
          value={data?.stats.openRatePct ? `${data.stats.openRatePct}%` : "—"}
          subtitle="+4.2% vs last month"
          icon={Eye}
          variant="gold"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3 pt-2">
        <button
          type="button"
          onClick={() => setActiveTab("compose")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === "compose"
              ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <Send className="h-4 w-4" />
          Compose & Broadcast
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === "history"
              ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Broadcast History & Scheduled
          {data?.campaigns.some((c) => c.status === "scheduled") && (
            <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-black text-slate-950">
              {data.campaigns.filter((c) => c.status === "scheduled").length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === "templates"
              ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <FileText className="h-4 w-4" />
          System Templates ({data?.templates.length ?? 8})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("rules")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
            activeTab === "rules"
              ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20"
              : "bg-white/5 text-slate-300 hover:bg-white/10"
          }`}
        >
          <Sliders className="h-4 w-4" />
          Delivery Rules & Quiet Hours
        </button>
      </div>

      {feedbackMessage && (
        <div
          className={`rounded-2xl p-4 text-sm font-semibold flex items-center justify-between ${
            feedbackMessage.type === "success"
              ? "bg-emerald-500/20 border border-emerald-500/30 text-emerald-200"
              : "bg-rose-500/20 border border-rose-500/30 text-rose-200"
          }`}
        >
          <span>{feedbackMessage.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMessage(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* TAB 1: COMPOSE & BROADCAST */}
      {activeTab === "compose" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Main Compose Form */}
          <div className="lg:col-span-7 space-y-6">
            <ConsoleCard title="New Message or Broadcast" subtitle="Target all viewers, selected cohorts, or individual users">
              <form onSubmit={handleSendBroadcast} className="space-y-5">
                {/* Audience Selection */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    1. Target Audience
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetType("all")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        targetType === "all"
                          ? "border-cyan-400 bg-cyan-400/10 text-white font-bold"
                          : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Users className="h-4 w-4 mb-1 text-cyan-400" />
                      <span className="text-xs">All Viewers</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType("segment")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        targetType === "segment"
                          ? "border-cyan-400 bg-cyan-400/10 text-white font-bold"
                          : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Sliders className="h-4 w-4 mb-1 text-purple-400" />
                      <span className="text-xs">Audience Segment</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType("single")}
                      className={`flex flex-col items-center justify-center rounded-xl border p-3 text-center transition ${
                        targetType === "single"
                          ? "border-cyan-400 bg-cyan-400/10 text-white font-bold"
                          : "border-white/10 bg-slate-900/60 text-slate-400 hover:text-white"
                      }`}
                    >
                      <Smartphone className="h-4 w-4 mb-1 text-green-400" />
                      <span className="text-xs">Single User</span>
                    </button>
                  </div>

                  {targetType === "segment" && (
                    <div className="mt-3">
                      <select
                        value={selectedSegment}
                        onChange={(e) => setSelectedSegment(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                      >
                        {AUDIENCE_SEGMENTS.map((s) => (
                          <option key={s.id} value={s.label}>
                            {s.label} — {s.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {targetType === "single" && (
                    <div className="mt-3">
                      <input
                        type="text"
                        placeholder="Enter recipient User UID or Email"
                        value={singleRecipient}
                        onChange={(e) => setSingleRecipient(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Delivery Channels */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    2. Delivery Channels
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes("push")}
                        onChange={() => handleChannelToggle("push")}
                        className="rounded border-white/20 bg-slate-800 text-cyan-400 focus:ring-0"
                      />
                      <Smartphone className="h-3.5 w-3.5 text-cyan-400" />
                      Mobile Push (Android & PWA)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes("in_app")}
                        onChange={() => handleChannelToggle("in_app")}
                        className="rounded border-white/20 bg-slate-800 text-cyan-400 focus:ring-0"
                      />
                      <Bell className="h-3.5 w-3.5 text-purple-400" />
                      In-App Notification
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer rounded-xl border border-white/10 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes("email")}
                        onChange={() => handleChannelToggle("email")}
                        className="rounded border-white/20 bg-slate-800 text-cyan-400 focus:ring-0"
                      />
                      <Mail className="h-3.5 w-3.5 text-green-400" />
                      Email Notification
                    </label>
                  </div>
                </div>

                {/* Quick Template Selector */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      3. Template (Optional)
                    </label>
                    <span className="text-[11px] text-cyan-400 flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> Pre-built variables
                    </span>
                  </div>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleSelectTemplate(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                  >
                    <option value="">-- Start with Blank Message --</option>
                    {data?.templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        [{tpl.category.toUpperCase()}] {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title & Body */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Notification Title
                      </label>
                      <span className="text-[10px] text-slate-500">{title.length}/100</span>
                    </div>
                    <input
                      type="text"
                      maxLength={100}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Weekend Premieres Are Live on BQ SQWAD TV"
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Message Body
                      </label>
                      <span className="text-[10px] text-slate-500">{body.length}/1000</span>
                    </div>
                    <textarea
                      rows={4}
                      maxLength={1000}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="Write your broadcast copy here..."
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 resize-none"
                      required
                    />
                  </div>

                  {/* Variable insertion buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400 font-medium mr-1">Insert variable:</span>
                    {["name", "walletBalance", "channelName", "seriesTitle", "amount"].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => insertVariable(v)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-mono text-cyan-300 hover:bg-white/10 transition"
                      >
                        +{`{{${v}}}`}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Deep Link (Optional)
                    </label>
                    <input
                      type="text"
                      value={deepLink}
                      onChange={(e) => setDeepLink(e.target.value)}
                      placeholder="e.g. /live or /wallet or /watch/nollywood-action"
                      className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400 font-mono text-xs"
                    />
                  </div>
                </div>

                {/* Scheduling & Delivery Controls */}
                <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      4. Dispatch Timing
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="sendTiming"
                          checked={sendTiming === "now"}
                          onChange={() => setSendTiming("now")}
                          className="text-cyan-400"
                        />
                        Send Now
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                        <input
                          type="radio"
                          name="sendTiming"
                          checked={sendTiming === "schedule"}
                          onChange={() => setSendTiming("schedule")}
                          className="text-cyan-400"
                        />
                        Schedule
                      </label>
                    </div>
                  </div>

                  {sendTiming === "schedule" && (
                    <div className="pt-2">
                      <label className="block text-[11px] text-slate-400 mb-1 font-semibold">
                        Schedule Date & Time (WAT / West Africa Time)
                      </label>
                      <input
                        type="datetime-local"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        className="w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                        required={sendTiming === "schedule"}
                      />
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={quietHours}
                        onChange={(e) => setQuietHours(e.target.checked)}
                        className="rounded border-white/20 bg-slate-800 text-cyan-400"
                      />
                      <span>Respect Quiet Hours (22:00 – 07:00 WAT)</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">Max per user/day:</span>
                      <select
                        value={frequencyCap}
                        onChange={(e) => setFrequencyCap(Number(e.target.value))}
                        className="rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-xs text-white outline-none"
                      >
                        <option value={1}>1</option>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={5}>5</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Audit Reason */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-amber-400 mb-1">
                    Audit Log Reason (Mandatory)
                  </label>
                  <input
                    type="text"
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                    placeholder="e.g. Weekend featured content announcement to all Nigerian subscribers"
                    className="w-full rounded-xl border border-amber-400/30 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                    required
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-3 text-sm font-extrabold text-slate-950 shadow-lg shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50 transition"
                >
                  <Send className="h-4 w-4" />
                  {isSubmitting
                    ? "Dispatching..."
                    : sendTiming === "schedule"
                    ? "Schedule Broadcast"
                    : "Send Broadcast Immediately"}
                </button>
              </form>
            </ConsoleCard>
          </div>

          {/* User Preview Panel */}
          <div className="lg:col-span-5 space-y-6">
            <ConsoleCard title="Preview as User" subtitle="Real-time rendering with variable substitution">
              <div className="flex items-center justify-center gap-2 border-b border-white/10 pb-3 mb-4">
                <button
                  type="button"
                  onClick={() => setPreviewChannel("push")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    previewChannel === "push"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Mobile Push
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewChannel("in_app")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    previewChannel === "in_app"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Bell className="h-3.5 w-3.5" />
                  In-App Banner
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewChannel("email")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    previewChannel === "email"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email Preview
                </button>
              </div>

              {/* Mobile Push Shade */}
              {previewChannel === "push" && (
                <div className="mx-auto max-w-[320px] rounded-3xl border border-white/20 bg-slate-950 p-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">Android System Shade</span>
                    <span>12:45 PM</span>
                  </div>

                  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/90 p-3.5 shadow-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <img
                        src="/brand/bq-sqwad-tv-logo.png"
                        alt="BQ SQWAD TV"
                        className="h-4 w-4 rounded-full bg-cyan-400/20 p-0.5 object-contain"
                      />
                      <span className="text-[11px] font-bold tracking-wider text-cyan-400 uppercase">
                        BQ SQWAD TV
                      </span>
                      <span className="ml-auto text-[10px] text-slate-500">now</span>
                    </div>
                    <div className="text-xs font-bold text-white mb-1 leading-snug">
                      {previewText.title}
                    </div>
                    <div className="text-[11px] text-slate-300 leading-relaxed">
                      {previewText.body}
                    </div>
                    {deepLink && (
                      <div className="mt-2 text-[10px] text-cyan-300 font-mono">
                        Tap to open: {deepLink}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* In-App Banner */}
              {previewChannel === "in_app" && (
                <div className="rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-[#041338] to-[#0A225C] p-4 text-white shadow-xl">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-cyan-400/20 p-2 text-cyan-300">
                      <Bell className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1">
                        In-App Alert
                      </div>
                      <div className="text-sm font-bold text-white mb-1">{previewText.title}</div>
                      <div className="text-xs text-slate-300 leading-relaxed mb-3">
                        {previewText.body}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-bold text-slate-950"
                        >
                          View Now
                        </button>
                        <button
                          type="button"
                          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-300"
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Email Mock */}
              {previewChannel === "email" && (
                <div className="rounded-2xl border border-white/15 bg-white text-slate-900 p-5 shadow-2xl">
                  <div className="border-b border-slate-200 pb-3 mb-3">
                    <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="h-6 w-auto" />
                    <div className="mt-2 text-xs text-slate-500">
                      From: BQ SQWAD TV &lt;tv@bqsqwad.com&gt;
                    </div>
                    <div className="text-xs font-bold text-slate-800">
                      Subject: {previewText.title}
                    </div>
                  </div>
                  <div className="text-xs text-slate-700 leading-relaxed mb-4">
                    <p className="font-bold mb-2">Hello Tunde,</p>
                    <p>{previewText.body}</p>
                  </div>
                  <div className="text-center">
                    <button
                      type="button"
                      className="rounded-xl bg-[#030b2a] px-5 py-2.5 text-xs font-bold text-white"
                    >
                      Open in BQ SQWAD TV
                    </button>
                  </div>
                  <div className="mt-6 border-t border-slate-100 pt-3 text-center text-[10px] text-slate-400">
                    BQ SQWAD TV • Unsubscribe • Lagos, Nigeria
                  </div>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-white/5 bg-slate-900/50 p-3 text-[11px] text-slate-400">
                Variables like <code className="text-cyan-300 font-mono">{"{{name}}"}</code> and <code className="text-cyan-300 font-mono">{"{{walletBalance}}"}</code> are automatically populated per recipient upon delivery.
              </div>
            </ConsoleCard>
          </div>
        </div>
      )}

      {/* TAB 2: BROADCAST HISTORY & SCHEDULED */}
      {activeTab === "history" && (
        <ConsoleCard
          title="Broadcast Campaigns & Scheduled Sends"
          subtitle="Track sent notifications, delivery rates, open rates and pending queue"
          headerAction={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10"
              >
                <Download className="h-3.5 w-3.5 text-cyan-400" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={fetchData}
                className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          }
        >
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {["all", "sent", "scheduled", "cancelled"].map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setHistoryFilter(st)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                    historyFilter === st
                      ? "bg-cyan-500 text-slate-950"
                      : "bg-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Search campaigns..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              className="rounded-xl border border-white/15 bg-slate-900 px-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400"
            />
          </div>

          <ConsoleTable
            columns={[
              { key: "title", label: "Campaign" },
              { key: "segment", label: "Audience" },
              { key: "channels", label: "Channels" },
              { key: "status", label: "Status" },
              { key: "timing", label: "Timing" },
              { key: "delivery", label: "Sent / Delivered" },
              { key: "openRate", label: "Open Rate" },
            ]}
            data={filteredCampaigns.map((row) => ({
              id: row.id,
              title: row.title,
              segment: row.segment,
              channels: row.channels.join(", "),
              status: row.status.toUpperCase(),
              timing:
                row.status === "scheduled" && row.scheduledFor
                  ? `Scheduled: ${new Date(row.scheduledFor).toLocaleString()}`
                  : `Sent: ${new Date(row.createdAt).toLocaleDateString()}`,
              delivery: `${row.sentCount.toLocaleString()} / ${row.deliveredCount.toLocaleString()}`,
              openRate: row.openRatePct > 0 ? `${row.openRatePct}%` : "—",
            }))}
          />
        </ConsoleCard>
      )}

      {/* TAB 3: SYSTEM NOTIFICATION TEMPLATES */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-300">
              Pre-configured automated system event triggers. These notifications trigger automatically when actions occur in the platform.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {data?.templates.map((tpl) => (
              <div
                key={tpl.id}
                className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-lg space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-cyan-400 uppercase">
                      {tpl.category}
                    </span>
                    <h3 className="font-bold text-white text-sm">{tpl.name}</h3>
                  </div>
                  <ConsoleStatusBadge status="active" label="AUTOMATED" />
                </div>

                <div className="rounded-xl border border-white/5 bg-slate-950 p-3 text-xs space-y-1">
                  <div className="font-bold text-cyan-300">{tpl.title}</div>
                  <div className="text-slate-300">{tpl.body}</div>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px]">
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>Trigger:</span>
                    <code className="text-amber-300 font-mono">{tpl.systemTrigger}</code>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>Variables:</span>
                    {tpl.variables.map((v) => (
                      <span key={v} className="rounded bg-white/5 px-1 font-mono text-cyan-300 text-[10px]">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DELIVERY RULES & QUIET HOURS */}
      {activeTab === "rules" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ConsoleCard title="Platform Quiet Hours" subtitle="Protect viewers from late night disturbances">
            <div className="space-y-4">
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white">Quiet Hours Window</span>
                  <ConsoleStatusBadge status="active" label="ACTIVE" />
                </div>
                <p className="text-xs text-slate-300 mb-3">
                  Broadcasts and marketing notifications dispatched during this window are queued and delivered at 07:00 local time.
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="rounded-lg border border-white/10 bg-slate-950 p-2.5">
                    <span className="text-slate-400 block text-[10px]">Starts At:</span>
                    <span className="text-cyan-300 font-bold text-sm">22:00 (10:00 PM)</span>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-slate-950 p-2.5">
                    <span className="text-slate-400 block text-[10px]">Ends At:</span>
                    <span className="text-cyan-300 font-bold text-sm">07:00 (07:00 AM)</span>
                  </div>
                </div>
                <div className="mt-2 text-[11px] text-slate-400">
                  Timezone reference: Africa/Lagos (WAT, UTC+1)
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <span className="text-xs font-bold text-white block mb-2">User Frequency Capping</span>
                <p className="text-xs text-slate-300 mb-2">
                  Prevents notification fatigue by enforcing a strict maximum number of non-transactional push notifications per user.
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Global Limit:</span>
                  <span className="rounded bg-cyan-400/20 px-2 py-0.5 text-xs font-bold text-cyan-300">
                    Max 3 pushes per user / 24 hours
                  </span>
                </div>
              </div>
            </div>
          </ConsoleCard>

          <ConsoleCard title="Delivery Infrastructure Health" subtitle="Real-time status of push and email gateways">
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 p-3.5">
                <div>
                  <div className="text-xs font-bold text-white">Mobile Push Delivery (FCM)</div>
                  <div className="text-[11px] text-slate-400">Android native push & PWA Web Push</div>
                </div>
                <ConsoleStatusBadge status="active" label="OPERATIONAL" />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 p-3.5">
                <div>
                  <div className="text-xs font-bold text-white">Email Delivery Gateway</div>
                  <div className="text-[11px] text-slate-400">Transational & broadcast email service</div>
                </div>
                <ConsoleStatusBadge status="active" label="OPERATIONAL" />
              </div>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-slate-900/60 p-3.5">
                <div>
                  <div className="text-xs font-bold text-white">In-App WebSocket / Realtime</div>
                  <div className="text-[11px] text-slate-400">Immediate in-app banner delivery</div>
                </div>
                <ConsoleStatusBadge status="active" label="CONNECTED" />
              </div>
            </div>
          </ConsoleCard>
        </div>
      )}
    </ConsoleShell>
  );
}
