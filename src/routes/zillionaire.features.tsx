import { useState, useEffect, FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
} from "@/components/ConsoleShell";
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  Flame,
  Tv,
  Users,
  Lock,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/features")({
  component: ZillionaireFeaturesRoute,
  head: () => ({
    meta: [
      { title: "Feature Controls | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface PlatformFlags {
  producerChannelCreation: boolean;
  waitingRoom: boolean;
  maintenanceMode: boolean;
  signupsOpen: boolean;
  commentsOpen: boolean;
  newStreamGrants: boolean;
  adultChannels: boolean;
  liveTv: boolean;
  providerConsole: boolean;
  hlsEncryption: boolean;
  forYou: boolean;
  reminders: boolean;
  modalSpendGuard: boolean;
  deliveryProxyFallback?: boolean;
}

const FLAG_METADATA: Record<
  keyof PlatformFlags,
  { label: string; description: string; category: "broadcast" | "viewer" | "emergency" }
> = {
  liveTv: {
    label: "Live TV & FAST Grid",
    description: "Enable live streaming FAST channels and EPG electronic programme guide",
    category: "broadcast",
  },
  producerChannelCreation: {
    label: "Producer Channel Creation",
    description: "Allow verified creators to register and launch new FAST broadcast channels",
    category: "broadcast",
  },
  providerConsole: {
    label: "Content Provider Console",
    description: "Grant syndication partners access to channel distribution and contract tools",
    category: "broadcast",
  },
  hlsEncryption: {
    label: "HLS Stream Encryption (AES-128)",
    description: "Enforce cryptographic key-rotation on all live and VOD video segments",
    category: "broadcast",
  },
  adultChannels: {
    label: "Restricted / Adult Channels",
    description: "Enable age-gated mature content with parental PIN verification",
    category: "broadcast",
  },
  signupsOpen: {
    label: "Public Viewer Signups",
    description: "Allow new viewers to create accounts and join BQ SQWAD TV",
    category: "viewer",
  },
  commentsOpen: {
    label: "Live Comments & Chat",
    description: "Enable real-time viewer commentary under live streams and on-demand assets",
    category: "viewer",
  },
  forYou: {
    label: "For You Recommendation Feed",
    description: "AI-driven personalized discovery carousel on home and category screens",
    category: "viewer",
  },
  reminders: {
    label: "Broadcast Reminders & Notifications",
    description: "Allow viewers to set alerts for upcoming scheduled broadcasts",
    category: "viewer",
  },
  newStreamGrants: {
    label: "New Playback Stream Grants",
    description: "Issue new session authorization grants for video playback across web and TV apps",
    category: "viewer",
  },
  maintenanceMode: {
    label: "Emergency Maintenance Mode",
    description: "Temporarily pause public viewing with branded maintenance announcement",
    category: "emergency",
  },
  waitingRoom: {
    label: "Traffic Surge Waiting Room",
    description: "Throttle ingress during high-concurrency events with a virtual queue",
    category: "emergency",
  },
  modalSpendGuard: {
    label: "Payment & Wallet Spend Guard",
    description: "Emergency rate-limiting on Paystack transactions and wallet debit orders",
    category: "emergency",
  },
  deliveryProxyFallback: {
    label: "CDN Delivery Proxy Fallback",
    description: "Route HLS streams through secondary origin edge proxy during primary outages",
    category: "emergency",
  },
};

function ZillionaireFeaturesRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="system">
      {({ token, account, onLock }) => (
        <ZillionaireFeaturesContent token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireFeaturesContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [flags, setFlags] = useState<PlatformFlags | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchFlags = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/config/flags", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load platform flags");
      setFlags(data.flags);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchFlags();
  }, [token]);

  const handleToggle = (key: keyof PlatformFlags) => {
    if (!flags) return;
    setFlags({
      ...flags,
      [key]: !flags[key],
    });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!flags) return;
    if (!reason.trim()) {
      setError("An audit justification reason is required to alter platform controls.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/zillionaire/config/flags", {
        method: "POST",
        headers,
        body: JSON.stringify({
          flags,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to commit platform flags");

      setSuccess("Platform feature controls updated and synchronized across all edge nodes.");
      setReason("");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error saving flags");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = flags ? Object.values(flags).filter(Boolean).length : 0;
  const emergencyCount = flags
    ? [flags.maintenanceMode, flags.waitingRoom, flags.modalSpendGuard].filter(Boolean).length
    : 0;

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Feature Switches & Global Controls"
      tagline="Real-time operational switches, CDN toggles, and emergency circuit breakers"
      activePath="/zillionaire/features"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={fetchFlags}
      isRefreshing={loading}
    >
      {success && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{success}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ConsoleWelcomeBanner
        title="Edge Platform Configuration"
        description="Toggle features across viewer apps, creator tools, and distribution networks. Changes take effect on next client polling cycle."
        badgeText="Core System Controls"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Total Platform Flags"
          value={flags ? Object.keys(flags).length : 14}
          subtitle="Managed edge switches"
          variant="blue"
          icon={Sliders}
        />
        <ConsoleKpiCard
          title="Active Features"
          value={activeCount}
          subtitle="Currently serving traffic"
          variant="green"
          icon={CheckCircle2}
        />
        <ConsoleKpiCard
          title="Emergency Flags Active"
          value={emergencyCount}
          subtitle={emergencyCount > 0 ? "Elevated operational state" : "Nominal state"}
          variant={emergencyCount > 0 ? "gold" : "purple"}
          icon={ShieldAlert}
        />
        <ConsoleKpiCard
          title="Maintenance Mode"
          value={flags?.maintenanceMode ? "ACTIVE" : "STANDBY"}
          subtitle={flags?.maintenanceMode ? "Platform locked" : "Normal operations"}
          variant={flags?.maintenanceMode ? "gold" : "green"}
          icon={Lock}
        />
      </div>

      {flags && (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Group 1: Broadcast & Streaming */}
          <ConsoleCard
            title="Broadcast & Stream Operations"
            description="Controls for live FAST stream ingestion, channel creation, and DRM key rotation."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FLAG_METADATA) as (keyof PlatformFlags)[])
                .filter((k) => FLAG_METADATA[k].category === "broadcast")
                .map((key) => {
                  const meta = FLAG_METADATA[key];
                  const isChecked = !!flags[key];
                  return (
                    <div
                      key={key}
                      onClick={() => handleToggle(key)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex items-start justify-between gap-3 ${
                        isChecked
                          ? "bg-cyan-950/30 border-cyan-500/40 hover:border-cyan-500/60"
                          : "bg-white/5 border-white/10 hover:border-white/20 opacity-70"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-xs">{meta.label}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {meta.description}
                        </span>
                      </div>
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
                          isChecked ? "bg-cyan-500" : "bg-slate-700"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition transform ${
                            isChecked ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </ConsoleCard>

          {/* Group 2: Viewer Experience */}
          <ConsoleCard
            title="Viewer Experience & Interactivity"
            description="Front-of-house controls for account creation, social interaction, and recommendation feeds."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FLAG_METADATA) as (keyof PlatformFlags)[])
                .filter((k) => FLAG_METADATA[k].category === "viewer")
                .map((key) => {
                  const meta = FLAG_METADATA[key];
                  const isChecked = !!flags[key];
                  return (
                    <div
                      key={key}
                      onClick={() => handleToggle(key)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex items-start justify-between gap-3 ${
                        isChecked
                          ? "bg-blue-950/30 border-blue-500/40 hover:border-blue-500/60"
                          : "bg-white/5 border-white/10 hover:border-white/20 opacity-70"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-xs">{meta.label}</span>
                        <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {meta.description}
                        </span>
                      </div>
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
                          isChecked ? "bg-blue-500" : "bg-slate-700"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition transform ${
                            isChecked ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </ConsoleCard>

          {/* Group 3: Emergency & Circuit Breakers */}
          <ConsoleCard
            title="Emergency Circuit Breakers & Ingress"
            description="Incident mitigation controls to isolate outages, throttle traffic spikes, or pause billing transactions."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(FLAG_METADATA) as (keyof PlatformFlags)[])
                .filter((k) => FLAG_METADATA[k].category === "emergency")
                .map((key) => {
                  const meta = FLAG_METADATA[key];
                  const isChecked = !!flags[key];
                  return (
                    <div
                      key={key}
                      onClick={() => handleToggle(key)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition select-none flex items-start justify-between gap-3 ${
                        isChecked
                          ? "bg-amber-950/40 border-amber-500/50 hover:border-amber-500/70"
                          : "bg-white/5 border-white/10 hover:border-white/20 opacity-70"
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                          {meta.label}
                          {isChecked && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/30 text-amber-300">
                              ACTIVE
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                          {meta.description}
                        </span>
                      </div>
                      <div
                        className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 ${
                          isChecked ? "bg-amber-500" : "bg-slate-700"
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition transform ${
                            isChecked ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          </ConsoleCard>

          {/* Save Bar */}
          <div className="p-4 rounded-2xl border border-slate-800 bg-[#08122c] flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[280px]">
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Audit Reason for Configuration Update *
              </label>
              <input
                type="text"
                placeholder="Reason (e.g., Scheduled maintenance window, CDN performance switch...)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-black/50 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-600/30 transition disabled:opacity-50 shrink-0"
            >
              {saving ? "Deploying Configuration..." : "Apply Platform Switches"}
            </button>
          </div>
        </form>
      )}
    </ConsoleShell>
  );
}
