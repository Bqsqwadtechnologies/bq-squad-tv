import { useState, useEffect, FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  Globe,
  Smartphone,
  Mail,
  Wallet,
  Clock,
  Lock,
  RefreshCw,
  Send,
  Plus,
  Trash2,
  ExternalLink,
  FileText,
  Layers,
  Radio,
  Eye,
  SlidersHorizontal,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { PlatformSettings, DEFAULT_PLATFORM_SETTINGS } from "@/lib/platform-settings-types";

export const Route = createFileRoute("/zillionaire/settings")({
  component: ZillionaireSettingsRoute,
  head: () => ({
    meta: [
      { title: "Platform Settings & Controls | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type SettingsTab =
  | "maintenance"
  | "limits"
  | "geofencing"
  | "commerce"
  | "versioning"
  | "communications";

function ZillionaireSettingsRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="settings">
      <ConsoleShell activeRoute="/zillionaire/settings">
        <ZillionaireSettingsContent />
      </ConsoleShell>
    </ConsolePageGuard>
  );
}

function ZillionaireSettingsContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("maintenance");
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_PLATFORM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );

  // New items inputs
  const [newIpInput, setNewIpInput] = useState("");
  const [newBlockedCountry, setNewBlockedCountry] = useState("");
  const [newAllowedCountry, setNewAllowedCountry] = useState("");

  // Test email state
  const [testEmailRecipient, setTestEmailRecipient] = useState("");
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/config/settings", { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
      }
    } catch {
      setFeedback({
        type: "error",
        message: "Failed to load platform settings. Showing active defaults.",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 3) {
      setFeedback({
        type: "error",
        message: "An audit reason of at least 3 characters is mandatory for saving platform settings.",
      });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/config/settings", {
        method: "PUT",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ settings, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || `HTTP ${res.status}`);
      }
      setSettings(data.settings);
      setReason("");
      setFeedback({
        type: "success",
        message: `Platform settings saved and audited successfully (version ${data.version}).`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save settings.";
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  }

  async function handleTestEmail() {
    setTestingEmail(true);
    setTestEmailResult(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/config/settings", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test_email",
          recipientEmail: testEmailRecipient || settings.supportEmail,
          reason: "Test email dispatch triggered from owner settings console",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
      setTestEmailResult(data.message || "Test email dispatched successfully.");
    } catch (err: unknown) {
      setTestEmailResult(err instanceof Error ? err.message : "Failed to dispatch test email.");
    } finally {
      setTestingEmail(false);
    }
  }

  function addBlockedIp() {
    const ip = newIpInput.trim();
    if (!ip) return;
    if (settings.blockedIps.includes(ip)) return;
    setSettings((prev) => ({ ...prev, blockedIps: [...prev.blockedIps, ip] }));
    setNewIpInput("");
  }

  function removeBlockedIp(ipToRemove: string) {
    setSettings((prev) => ({
      ...prev,
      blockedIps: prev.blockedIps.filter((ip) => ip !== ipToRemove),
    }));
  }

  function addBlockedCountry() {
    const code = newBlockedCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (settings.blockedCountries.includes(code)) return;
    setSettings((prev) => ({ ...prev, blockedCountries: [...prev.blockedCountries, code] }));
    setNewBlockedCountry("");
  }

  function removeBlockedCountry(code: string) {
    setSettings((prev) => ({
      ...prev,
      blockedCountries: prev.blockedCountries.filter((c) => c !== code),
    }));
  }

  function addAllowedCountry() {
    const code = newAllowedCountry.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return;
    if (settings.allowedCountries.includes(code)) return;
    setSettings((prev) => ({ ...prev, allowedCountries: [...prev.allowedCountries, code] }));
    setNewAllowedCountry("");
  }

  function removeAllowedCountry(code: string) {
    setSettings((prev) => ({
      ...prev,
      allowedCountries: prev.allowedCountries.filter((c) => c !== code),
    }));
  }

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Platform Settings & System Controls"
        description="Configure platform-wide operating parameters, maintenance gates, rate limits, geofencing, wallet constraints, Android force-updates, and transactional email routing."
        role="zillionaire"
        badge={settings.maintenanceMode ? "MAINTENANCE ACTIVE" : "PLATFORM ONLINE"}
        action={{
          label: "View Feature Toggles",
          href: "/zillionaire/features",
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Maintenance Mode"
          value={settings.maintenanceMode ? "ENABLED" : "STANDBY"}
          subtext={
            settings.maintenanceMode
              ? settings.ownerBypass
                ? "Active (Owner bypass allowed)"
                : "Active (All public access locked)"
              : "All streaming services online"
          }
          icon={ShieldAlert}
          gradient={settings.maintenanceMode ? "rose" : "emerald"}
        />

        <ConsoleKpiCard
          title="Geofencing Rules"
          value={
            settings.countryAccessMode === "all_except_blocked"
              ? `${settings.blockedCountries.length} Blocked`
              : `${settings.allowedCountries.length} Allowed Only`
          }
          subtext={`${settings.blockedIps.length} active IP/CIDR block rules`}
          icon={Globe}
          gradient="blue"
        />

        <ConsoleKpiCard
          title="Android Release Gate"
          value={`v${settings.minAndroidVersionCode} Min`}
          subtext={
            settings.forceUpdateAndroid
              ? `Force update active (target v${settings.latestAndroidVersionCode})`
              : `Current release: v${settings.androidVersionName}`
          }
          icon={Smartphone}
          gradient={settings.forceUpdateAndroid ? "amber" : "purple"}
        />

        <ConsoleKpiCard
          title="Session & Rate Limits"
          value={`${settings.maxConcurrentSessions} Sessions`}
          subtext={`${settings.publicApiRpm} RPM public / ${settings.authAttemptsRpm} auth RPM`}
          icon={Clock}
          gradient="cyan"
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 gap-2 overflow-x-auto pb-1 text-sm font-medium">
        {[
          { id: "maintenance", label: "Maintenance & Ticker", icon: ShieldAlert },
          { id: "limits", label: "Session & Rate Limits", icon: Clock },
          { id: "geofencing", label: "Geofencing & IP Blocks", icon: Globe },
          { id: "commerce", label: "Wallet & Commerce", icon: Wallet },
          { id: "versioning", label: "App & Legal Gates", icon: Smartphone },
          { id: "communications", label: "Communications & Sender", icon: Mail },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg transition-colors whitespace-nowrap ${
                isActive
                  ? "bg-white/10 text-white border-b-2 border-emerald-400 font-semibold"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 ${
            feedback.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/30 text-rose-300"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-medium">{feedback.message}</div>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-zinc-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
          <span>Loading platform settings...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* TAB 1: Maintenance & Broadcast Ticker */}
          {activeTab === "maintenance" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Platform Maintenance Mode"
                description="Immediately gate public routes and redirect viewers to the maintenance page."
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <Lock className="w-4 h-4 text-rose-400" />
                        Maintenance Lockdown Active
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Blocks new sessions and routes incoming viewers to the maintenance landing page.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.maintenanceMode}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, maintenanceMode: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-rose-500 focus:ring-rose-500 focus:ring-offset-zinc-900"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-emerald-400" />
                        Owner Console Bypass
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Allows verified Zillionaire owners and delegates to access consoles during maintenance.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.ownerBypass}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, ownerBypass: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Public Maintenance Notice Message
                    </label>
                    <textarea
                      rows={3}
                      value={settings.maintenanceMessage}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, maintenanceMessage: e.target.value }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      placeholder="Enter the explanation shown to viewers..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Estimated Completion Time (Optional ISO or Text)
                    </label>
                    <input
                      type="text"
                      value={settings.maintenanceEndsAt || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          maintenanceEndsAt: e.target.value ? e.target.value : null,
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 2026-11-20T18:00:00Z or ~30 minutes"
                    />
                  </div>
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="Global Announcement Ticker"
                description="Display a high-visibility announcement or breaking banner across all viewer pages."
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <Radio className="w-4 h-4 text-cyan-400" />
                        Enable Global Announcement Banner
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Renders as a top-level notice bar across web and mobile experiences.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.announcementEnabled}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, announcementEnabled: e.target.checked }))
                      }
                      className="w-5 h-5 rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Banner Style / Severity
                    </label>
                    <select
                      value={settings.announcementType}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          announcementType: e.target.value as PlatformSettings["announcementType"],
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="info">Info (Cyan / Informative)</option>
                      <option value="warning">Warning (Amber / Advisory)</option>
                      <option value="success">Success (Emerald / Celebration)</option>
                      <option value="emergency">Emergency (Rose / High Alert)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Announcement Text
                    </label>
                    <textarea
                      rows={2}
                      value={settings.announcementText}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, announcementText: e.target.value }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. Special live premiere tonight at 20:00 GMT!"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Link URL (Optional)
                      </label>
                      <input
                        type="text"
                        value={settings.announcementLink}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, announcementLink: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        placeholder="/movies or https://..."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Link Button Label
                      </label>
                      <input
                        type="text"
                        value={settings.announcementLinkLabel}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            announcementLinkLabel: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                        placeholder="View Premiere"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-zinc-900/60 rounded-lg border border-white/5">
                    <span className="text-sm text-zinc-300">Allow viewers to dismiss banner</span>
                    <input
                      type="checkbox"
                      checked={settings.announcementDismissible}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          announcementDismissible: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* TAB 2: Session & Rate Limits */}
          {activeTab === "limits" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Playback Sessions & Device Policies"
                description="Set concurrency caps and device registration ceilings per authenticated account."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Max Concurrent Streams
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={settings.maxConcurrentSessions}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            maxConcurrentSessions: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Simultaneous stream leases per viewer (default: 2)
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Max Registered Devices
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={settings.maxDevicesPerAccount}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            maxDevicesPerAccount: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Device slots per user profile (default: 5)
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Session Expiry (Days)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={settings.sessionExpiryDays}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          sessionExpiryDays: parseInt(e.target.value, 10) || 30,
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-zinc-400 mt-1 block">
                      Number of days before an idle refresh token is expired (default: 30)
                    </span>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <Lock className="w-4 h-4 text-cyan-400" />
                        Strict Device Fingerprinting
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Enforce client canvas/hardware hash matching on each session lease.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.requireDeviceFingerprint}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          requireDeviceFingerprint: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-cyan-500 focus:ring-cyan-500 focus:ring-offset-zinc-900"
                    />
                  </div>
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="Rate Limits & Capacity Protection"
                description="Throttle aggressive traffic, brute-force auth attempts, and rapid streaming grant requests."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Public API (RPM)
                      </label>
                      <input
                        type="number"
                        min={10}
                        max={10000}
                        value={settings.publicApiRpm}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            publicApiRpm: parseInt(e.target.value, 10) || 120,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Requests per min per IP
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Auth Attempts (RPM)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={settings.authAttemptsRpm}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            authAttemptsRpm: parseInt(e.target.value, 10) || 10,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Login/sign-up attempts per min
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Stream Token Grants (RPM)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={500}
                        value={settings.streamGrantRpm}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            streamGrantRpm: parseInt(e.target.value, 10) || 30,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Playback token requests per min
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Video Uploads (RPH)
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={500}
                        value={settings.videoUploadRph}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            videoUploadRph: parseInt(e.target.value, 10) || 20,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Uploads per hour per creator
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-blue-950/20 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                    Rate limits apply globally with automatic Cloudflare edge burst-caching and Redis failover.
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* TAB 3: Geofencing & IP Blocks */}
          {activeTab === "geofencing" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Country-Level Geofencing"
                description="Control territory rights and geo-distribution boundaries for viewer access."
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Country Access Policy
                    </label>
                    <select
                      value={settings.countryAccessMode}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          countryAccessMode: e.target.value as PlatformSettings["countryAccessMode"],
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="all_except_blocked">
                        Allow All Countries (Except Blocked List)
                      </option>
                      <option value="only_allowed">
                        Strict Whitelist (Only Specified Allowed Countries)
                      </option>
                    </select>
                  </div>

                  {settings.countryAccessMode === "all_except_blocked" ? (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Blocked Countries (ISO-3166 2-Letter Codes)
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          maxLength={2}
                          value={newBlockedCountry}
                          onChange={(e) => setNewBlockedCountry(e.target.value.toUpperCase())}
                          placeholder="e.g. RU"
                          className="w-24 bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white uppercase focus:outline-none focus:border-rose-500"
                        />
                        <button
                          type="button"
                          onClick={addBlockedCountry}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Block
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 bg-zinc-900/50 rounded-lg border border-white/5">
                        {settings.blockedCountries.length === 0 && (
                          <span className="text-xs text-zinc-500 italic">No countries blocked.</span>
                        )}
                        {settings.blockedCountries.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/40 border border-rose-500/30 text-rose-300 rounded text-xs font-mono font-semibold"
                          >
                            {code}
                            <button
                              type="button"
                              onClick={() => removeBlockedCountry(code)}
                              className="text-rose-400 hover:text-white"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Allowed Whitelist Countries (ISO-3166 Codes)
                      </label>
                      <div className="flex gap-2 mb-2">
                        <input
                          type="text"
                          maxLength={2}
                          value={newAllowedCountry}
                          onChange={(e) => setNewAllowedCountry(e.target.value.toUpperCase())}
                          placeholder="e.g. NG"
                          className="w-24 bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white uppercase focus:outline-none focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={addAllowedCountry}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Country
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-2 bg-zinc-900/50 rounded-lg border border-white/5">
                        {settings.allowedCountries.length === 0 && (
                          <span className="text-xs text-zinc-500 italic">No whitelist set.</span>
                        )}
                        {settings.allowedCountries.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded text-xs font-mono font-semibold"
                          >
                            {code}
                            <button
                              type="button"
                              onClick={() => removeAllowedCountry(code)}
                              className="text-emerald-400 hover:text-white"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="IP & CIDR Subnet Blocklist"
                description="Immediately reject edge network requests from specific offending IP addresses or CIDRs."
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Add Block Rule (IPv4 or Subnet e.g. 192.168.1.1 or 10.0.0.0/24)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newIpInput}
                        onChange={(e) => setNewIpInput(e.target.value)}
                        placeholder="e.g. 203.0.113.42 or 198.51.100.0/24"
                        className="flex-1 bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-rose-500"
                      />
                      <button
                        type="button"
                        onClick={addBlockedIp}
                        className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Block Rule
                      </button>
                    </div>
                  </div>

                  <div className="border border-white/10 rounded-lg overflow-hidden bg-zinc-950/50 max-h-56 overflow-y-auto">
                    {settings.blockedIps.length === 0 ? (
                      <div className="p-4 text-xs text-zinc-500 text-center italic">
                        No active IP or CIDR block rules.
                      </div>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-zinc-900 text-zinc-400 font-semibold border-b border-white/10">
                          <tr>
                            <th className="px-3 py-2">Blocked IP / CIDR</th>
                            <th className="px-3 py-2 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {settings.blockedIps.map((ip) => (
                            <tr key={ip} className="hover:bg-white/5">
                              <td className="px-3 py-2 text-zinc-300">{ip}</td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeBlockedIp(ip)}
                                  className="text-rose-400 hover:text-rose-300 text-xs font-sans inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* TAB 4: Wallet & Commerce Rules */}
          {activeTab === "commerce" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Wallet Boundaries & Top-Up Limits"
                description="Set global minimum and maximum top-up amounts and daily spend ceilings."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Minimum Top-Up (Minor Units)
                      </label>
                      <input
                        type="number"
                        min={100}
                        value={settings.minTopupMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            minTopupMinor: parseInt(e.target.value, 10) || 50000,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        50,000 minor = ₦500.00
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Maximum Top-Up (Minor Units)
                      </label>
                      <input
                        type="number"
                        min={100}
                        value={settings.maxTopupMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            maxTopupMinor: parseInt(e.target.value, 10) || 5000000,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        5,000,000 minor = ₦50,000.00
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Max Wallet Balance (Minor)
                      </label>
                      <input
                        type="number"
                        min={1000}
                        value={settings.maxWalletBalanceMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            maxWalletBalanceMinor: parseInt(e.target.value, 10) || 50000000,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        50,000,000 minor = ₦500,000.00
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Daily Spend Limit (Minor)
                      </label>
                      <input
                        type="number"
                        min={1000}
                        value={settings.dailySpendLimitMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            dailySpendLimitMinor: parseInt(e.target.value, 10) || 10000000,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        10,000,000 minor = ₦100,000.00
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white">Allow Negative Wallet Balance</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Permit playback sessions to finish current minutes even if balance drops to zero.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.allowNegativeBalance}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          allowNegativeBalance: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900"
                    />
                  </div>
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="Streaming Tariff & Revenue Splits"
                description="Default per-minute viewer billing rates and creator revenue-share split."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Default Rate / Min (Minor)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={settings.defaultRatePerMinuteMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            defaultRatePerMinuteMinor: parseInt(e.target.value, 10) || 500,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        500 minor = ₦5.00/min
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Min Session Balance (Minor)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={settings.minimumSessionBalanceMinor}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            minimumSessionBalanceMinor: parseInt(e.target.value, 10) || 2500,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="text-xs text-zinc-400 mt-1 block">
                        Required to start stream (₦25.00)
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Default Producer Revenue Share (Basis Points, 7000 = 70%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      value={settings.defaultProducerShareBps}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          defaultProducerShareBps: parseInt(e.target.value, 10) || 7000,
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                    <span className="text-xs text-zinc-400 mt-1 block">
                      Creator gets {settings.defaultProducerShareBps / 100}% of gross watch-time proceeds.
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Default Currency
                      </label>
                      <input
                        type="text"
                        maxLength={3}
                        value={settings.defaultCurrency}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            defaultCurrency: e.target.value.toUpperCase(),
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white uppercase focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Supported Currencies
                      </label>
                      <input
                        type="text"
                        value={settings.supportedCurrencies.join(", ")}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            supportedCurrencies: e.target.value
                              .split(",")
                              .map((c) => c.trim().toUpperCase())
                              .filter((c) => /^[A-Z]{3}$/.test(c)),
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white uppercase focus:outline-none focus:border-emerald-500"
                        placeholder="NGN, USD, GBP, EUR"
                      />
                    </div>
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* TAB 5: App & Legal Version Gates */}
          {activeTab === "versioning" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Android App Version Gating"
                description="Control minimum and recommended release versions for Google Play Store app distribution."
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-amber-400" />
                        Enforce Force-Update Dialog
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Blocks app launch on versions below latest code until updated from Play Store.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.forceUpdateAndroid}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          forceUpdateAndroid: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-amber-500 focus:ring-offset-zinc-900"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Min Version Code
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={settings.minAndroidVersionCode}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            minAndroidVersionCode: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Latest Version Code
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={settings.latestAndroidVersionCode}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            latestAndroidVersionCode: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Version Name
                      </label>
                      <input
                        type="text"
                        value={settings.androidVersionName}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            androidVersionName: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Google Play Store / Download URL
                    </label>
                    <input
                      type="url"
                      value={settings.androidUpdateUrl}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, androidUpdateUrl: e.target.value }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      placeholder="https://play.google.com/store/apps/details?id=..."
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Release Notes (Shown on Update Modal)
                    </label>
                    <textarea
                      rows={2}
                      value={settings.androidReleaseNotes}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, androidReleaseNotes: e.target.value }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="Legal Acceptance Version Gates"
                description="Prompt users to re-accept legal agreements whenever terms are bumped."
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3.5 bg-zinc-900/60 rounded-lg border border-white/5">
                    <div>
                      <div className="font-medium text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-purple-400" />
                        Require Legal Re-Acceptance
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        Prompts active users to consent to updated terms before streaming or topping up.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.requireLegalReacceptance}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          requireLegalReacceptance: e.target.checked,
                        }))
                      }
                      className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Terms of Service
                      </label>
                      <input
                        type="text"
                        value={settings.termsVersion}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, termsVersion: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Privacy Policy
                      </label>
                      <input
                        type="text"
                        value={settings.privacyVersion}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, privacyVersion: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Producer Terms
                      </label>
                      <input
                        type="text"
                        value={settings.producerTermsVersion}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            producerTermsVersion: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Effective Date Label
                    </label>
                    <input
                      type="text"
                      value={settings.legalEffectiveDate}
                      onChange={(e) =>
                        setSettings((prev) => ({ ...prev, legalEffectiveDate: e.target.value }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      placeholder="e.g. 2026-01-01"
                    />
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* TAB 6: Communications & Sender */}
          {activeTab === "communications" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ConsoleCard
                title="Email Routing & System Senders"
                description="Configure default sender addresses for authentication, receipts, and system alerts."
              >
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Sender Display Name
                      </label>
                      <input
                        type="text"
                        value={settings.senderName}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, senderName: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Sender Email (From)
                      </label>
                      <input
                        type="email"
                        value={settings.senderEmail}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, senderEmail: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Support Desk Email
                      </label>
                      <input
                        type="email"
                        value={settings.supportEmail}
                        onChange={(e) =>
                          setSettings((prev) => ({ ...prev, supportEmail: e.target.value }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                        Alerts & Security Email
                      </label>
                      <input
                        type="email"
                        value={settings.notificationsEmail}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            notificationsEmail: e.target.value,
                          }))
                        }
                        className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Email Delivery Infrastructure
                    </label>
                    <select
                      value={settings.emailProvider}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          emailProvider: e.target.value as PlatformSettings["emailProvider"],
                        }))
                      }
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="lovable_managed">Lovable Cloud Managed (Zero Config)</option>
                      <option value="sendgrid">Twilio SendGrid API</option>
                      <option value="postmark">Postmark Inbound/Outbound</option>
                      <option value="custom_smtp">Custom SMTP Gateway</option>
                    </select>
                  </div>
                </div>
              </ConsoleCard>

              <ConsoleCard
                title="Dispatch Verification Test"
                description="Verify that outbound transactional delivery functions properly with current credentials."
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                      Test Recipient Email
                    </label>
                    <input
                      type="email"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      placeholder={settings.supportEmail || "you@example.com"}
                      className="w-full bg-zinc-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={testingEmail}
                    onClick={handleTestEmail}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    {testingEmail ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Dispatching...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> Dispatch Test Message
                      </>
                    )}
                  </button>

                  {testEmailResult && (
                    <div className="p-3 bg-zinc-900/80 rounded-lg border border-white/10 text-xs text-zinc-300">
                      {testEmailResult}
                    </div>
                  )}

                  <div className="p-3.5 bg-zinc-900/40 rounded-lg border border-white/5 text-xs text-zinc-400">
                    Dispatched tests create an audit log entry in the Safety Centre with timestamp and carrier route.
                  </div>
                </div>
              </ConsoleCard>
            </div>
          )}

          {/* Persistent Audit Reason & Save Bar */}
          <div className="sticky bottom-4 z-20 bg-zinc-900/95 backdrop-blur-md border border-white/15 rounded-xl p-4 shadow-2xl flex flex-col md:flex-row items-center gap-4 justify-between">
            <div className="flex-1 w-full">
              <label className="block text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                Mandatory Audit Reason (Required for all changes)
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe why platform settings are being modified (e.g. 'Updated streaming rate limit for live event')"
                className="w-full bg-zinc-950 border border-white/15 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
              <button
                type="button"
                onClick={loadSettings}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors"
              >
                Reset Form
              </button>

              <button
                type="submit"
                disabled={saving || reason.trim().length < 3}
                className="flex-1 md:flex-none px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Save & Apply Controls
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
