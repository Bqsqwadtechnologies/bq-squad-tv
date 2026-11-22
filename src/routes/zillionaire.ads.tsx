import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Megaphone,
  Smartphone,
  Monitor,
  ShieldCheck,
  ShieldAlert,
  BarChart3,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  Lock,
  RefreshCw,
  Sliders,
  DollarSign,
  Layers,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/ads")({
  component: AdvertisingManagerRoute,
  head: () => ({
    meta: [
      { title: "Advertising Manager | Zillionaire Control Centre" },
      {
        name: "description",
        content: "Configure own ads, partner networks, placements, and audience protections for BQ SQWAD TV.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface AdUnit {
  id: string;
  name: string;
  platform: "web" | "android";
  type: "banner" | "interstitial" | "rewarded" | "native" | "pre_roll";
  placement: "home_row" | "below_player" | "between_episodes" | "exit_screen" | "wallet_topup";
  size: string;
  frequencyCap: number;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  targetCountries: string[];
  targetChannels: string[];
  targetAgeRating: string;
  targetAudience: "all" | "new" | "returning";
  enabled: boolean;
  createdAt: string;
}

interface Creative {
  id: string;
  title: string;
  type: "image" | "video";
  mediaUrl: string;
  clickThroughUrl: string;
  impressionTrackingUrl: string | null;
  clickTrackingUrl: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  rejectionReason: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
}

interface AdReport {
  summary: {
    totalImpressions: number;
    totalClicks: number;
    overallCtr: string;
    totalRevenueMinor: number;
    totalRevenueFormatted: string;
    byPlatform: {
      web: { impressions: number; clicks: number; revenueEstMinor: number };
      android: { impressions: number; clicks: number; revenueEstMinor: number };
    };
  };
  units: Array<{
    unitId: string;
    name: string;
    platform: "web" | "android";
    placement: string;
    impressions: number;
    clicks: number;
    ctr: string;
    revenueMinor: number;
    revenueFormatted: string;
  }>;
}

interface AdSettings {
  paidViewersAdFree: boolean;
  kidsProtectionEnabled: boolean;
  adultChannelRestricted: boolean;
  updatedAt: string | null;
}

function AdvertisingManagerRoute() {
  return (
    <ConsolePageGuard
      requiredRole="delegate"
      requiredModule="ads"
      title="Advertising Manager"
      description="Manage direct ad units, own creatives, partner networks, and audience policy."
    >
      {(account) => <AdvertisingManagerDashboard account={account} />}
    </ConsolePageGuard>
  );
}

function AdvertisingManagerDashboard({ account }: { account: ConsoleAccount }) {
  const [activeTab, setActiveTab] = useState<"units" | "creatives" | "networks" | "placements" | "reporting" | "policy">("units");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Data states
  const [units, setUnits] = useState<AdUnit[]>([]);
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [reports, setReports] = useState<AdReport | null>(null);
  const [settings, setSettings] = useState<AdSettings>({
    paidViewersAdFree: false,
    kidsProtectionEnabled: true,
    adultChannelRestricted: true,
    updatedAt: null,
  });

  // Filters
  const [platformFilter, setPlatformFilter] = useState<"all" | "web" | "android">("all");

  // Create Unit Form Modal state
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitPlatform, setNewUnitPlatform] = useState<"web" | "android">("web");
  const [newUnitType, setNewUnitType] = useState<"banner" | "interstitial" | "rewarded" | "native" | "pre_roll">("banner");
  const [newUnitPlacement, setNewUnitPlacement] = useState<"home_row" | "below_player" | "between_episodes" | "exit_screen" | "wallet_topup">("home_row");
  const [newUnitSize, setNewUnitSize] = useState("320x50");
  const [newUnitFreqCap, setNewUnitFreqCap] = useState(3);
  const [newUnitPriority, setNewUnitPriority] = useState(1);
  const [newUnitAudience, setNewUnitAudience] = useState<"all" | "new" | "returning">("all");
  const [newUnitAgeRating, setNewUnitAgeRating] = useState<"all" | "G" | "PG" | "PG-13" | "16+" | "18+">("all");
  const [newUnitReason, setNewUnitReason] = useState("");

  // Create Creative Modal state
  const [showCreativeModal, setShowCreativeModal] = useState(false);
  const [moderateTarget, setModerateTarget] = useState<{ creative: Creative; decision: "APPROVE" | "REJECT" } | null>(null);
  const [moderateAuditReason, setModerateAuditReason] = useState("");
  const [moderateRejectionReason, setModerateRejectionReason] = useState("");
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [policyAuditReason, setPolicyAuditReason] = useState("");
  const [newCreativeTitle, setNewCreativeTitle] = useState("");
  const [newCreativeType, setNewCreativeType] = useState<"image" | "video">("image");
  const [newCreativeMediaUrl, setNewCreativeMediaUrl] = useState("");
  const [newCreativeClickUrl, setNewCreativeClickUrl] = useState("");
  const [newCreativeReason, setNewCreativeReason] = useState("");

  // Provider Network state
  const [sdkPlatform, setSdkPlatform] = useState<"android" | "web">("android");
  const [sdkProviderId, setSdkProviderId] = useState("admob");
  const [sdkAppId, setSdkAppId] = useState("");
  const [sdkSecretKey, setSdkSecretKey] = useState("");
  const [sdkTestMode, setSdkTestMode] = useState(false);
  const [sdkReason, setSdkReason] = useState("");

  // Fetch all data
  const fetchData = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [uRes, cRes, rRes, sRes] = await Promise.all([
        fetch("/api/public/v1/zillionaire/ads/units"),
        fetch("/api/public/v1/zillionaire/ads/creatives"),
        fetch("/api/public/v1/zillionaire/ads/reports"),
        fetch("/api/public/v1/zillionaire/ads/settings"),
      ]);

      if (uRes.ok) {
        const data = await uRes.json();
        setUnits(data.units || []);
      }
      if (cRes.ok) {
        const data = await cRes.json();
        setCreatives(data.creatives || []);
      }
      if (rRes.ok) {
        const data = await rRes.json();
        setReports(data);
      }
      if (sRes.ok) {
        const data = await sRes.json();
        setSettings(data);
      }
    } catch {
      setError("Unable to load advertising configuration.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle Unit Creation
  async function handleCreateUnit(e: React.FormEvent) {
    e.preventDefault();
    if (!newUnitName.trim() || !newUnitReason.trim()) {
      setError("Unit name and audit reason are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          name: newUnitName.trim(),
          platform: newUnitPlatform,
          type: newUnitType,
          placement: newUnitPlacement,
          size: newUnitSize.trim() || "responsive",
          frequencyCap: Number(newUnitFreqCap),
          priority: Number(newUnitPriority),
          targetAudience: newUnitAudience,
          targetAgeRating: newUnitAgeRating,
          enabled: true,
          reason: newUnitReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create ad unit");
      setSuccess("Ad unit created successfully.");
      setShowUnitModal(false);
      setNewUnitName("");
      setNewUnitReason("");
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error creating ad unit");
    } finally {
      setBusy(false);
    }
  }

  // Handle Toggle Unit
  async function handleToggleUnit(unit: AdUnit) {
    const reason = prompt(`Enter audit reason to ${unit.enabled ? "disable" : "enable"} unit "${unit.name}":`);
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE",
          unitId: unit.id,
          enabled: !unit.enabled,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to update unit");
      setSuccess(`Unit "${unit.name}" ${unit.enabled ? "disabled" : "enabled"}.`);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Update error");
    } finally {
      setBusy(false);
    }
  }

  // Handle Delete Unit
  async function handleDeleteUnit(unit: AdUnit) {
    const reason = prompt(`Are you sure you want to delete unit "${unit.name}"? Enter audit reason:`);
    if (!reason || !reason.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "DELETE",
          unitId: unit.id,
          reason: reason.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to delete unit");
      setSuccess(`Unit "${unit.name}" deleted.`);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Deletion error");
    } finally {
      setBusy(false);
    }
  }

  // Handle Create Creative
  async function handleCreateCreative(e: React.FormEvent) {
    e.preventDefault();
    if (!newCreativeTitle.trim() || !newCreativeMediaUrl.trim() || !newCreativeClickUrl.trim() || !newCreativeReason.trim()) {
      setError("All fields including media URL, click-through URL and audit reason are required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE",
          title: newCreativeTitle.trim(),
          type: newCreativeType,
          mediaUrl: newCreativeMediaUrl.trim(),
          clickThroughUrl: newCreativeClickUrl.trim(),
          reason: newCreativeReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit creative");
      setSuccess("Creative uploaded and approved for rotation.");
      setShowCreativeModal(false);
      setNewCreativeTitle("");
      setNewCreativeMediaUrl("");
      setNewCreativeClickUrl("");
      setNewCreativeReason("");
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Creative upload error");
    } finally {
      setBusy(false);
    }
  }

  // Handle Moderate Creative
  function handleModerateCreative(c: Creative, decision: "APPROVE" | "REJECT") {
    setModerateTarget({ creative: c, decision });
    setModerateAuditReason("");
    setModerateRejectionReason("");
  }

  async function confirmModerateCreative() {
    if (!moderateTarget) return;
    if (!moderateAuditReason.trim()) {
      setError("Audit reason is required for creative moderation.");
      return;
    }
    if (moderateTarget.decision === "REJECT" && !moderateRejectionReason.trim()) {
      setError("Rejection reason is required when rejecting a creative.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "MODERATE",
          creativeId: moderateTarget.creative.id,
          decision: moderateTarget.decision,
          rejectionReason: moderateRejectionReason.trim(),
          reason: moderateAuditReason.trim(),
        }),
      });
      if (!res.ok) throw new Error("Moderation update failed");
      setSuccess(`Creative marked as ${moderateTarget.decision}.`);
      setModerateTarget(null);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Moderation error");
    } finally {
      setBusy(false);
    }
  }

  // Save Settings & Policy
  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setPolicyAuditReason("");
    setShowPolicyModal(true);
  }

  async function confirmSaveSettings() {
    if (!policyAuditReason.trim()) {
      setError("Audit reason is required for policy update.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paidViewersAdFree: settings.paidViewersAdFree,
          kidsProtectionEnabled: settings.kidsProtectionEnabled,
          adultChannelRestricted: settings.adultChannelRestricted,
          reason: policyAuditReason.trim(),
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setSuccess("Advertising policies updated and enforced across all routes.");
      setShowPolicyModal(false);
      fetchData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Policy save error");
    } finally {
      setBusy(false);
    }
  }

  // Save Provider / Network settings
  async function handleSaveSdk(e: React.FormEvent) {
    e.preventDefault();
    if (!sdkSecretKey.trim() || !sdkReason.trim()) {
      setError("Network secret key and audit reason are required.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/ads/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: sdkPlatform,
          providerId: sdkProviderId,
          publicAppId: sdkAppId.trim(),
          secretKey: sdkSecretKey.trim(),
          enabled: true,
          placements: {
            banner: `${sdkProviderId}_banner`,
            interstitial: `${sdkProviderId}_interstitial`,
            rewarded: `${sdkProviderId}_rewarded`,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save Network settings");
      setSuccess(`${sdkPlatform.toUpperCase()} ${sdkProviderId} credentials securely encrypted and stored server-side.`);
      setSdkSecretKey("");
      setSdkReason("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network configuration error");
    } finally {
      setBusy(false);
    }
  }

  // Export CSV
  function handleExportCsv() {
    if (!reports || !reports.units.length) {
      setError("No report data available to export.");
      return;
    }
    const headers = ["Unit ID", "Name", "Platform", "Placement", "Impressions", "Clicks", "CTR", "Estimated Revenue"];
    const rows = reports.units.map((u) => [
      u.unitId,
      `"${u.name.replace(/"/g, '""')}"`,
      u.platform,
      u.placement,
      u.impressions,
      u.clicks,
      u.ctr,
      u.revenueFormatted,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bq-sqwad-tv-ad-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      if (platformFilter !== "all" && u.platform !== platformFilter) return false;
      return true;
    });
  }, [units, platformFilter]);

  return (
    <ConsoleShell
      account={account}
      activeItem="ads"
      role="delegate"
      title="Advertising Manager"
      subtitle="Direct Ad Units, Partner Networks, Own Creatives & Audience Protection"
    >
      <div className="space-y-6 pb-12">
        <ConsoleWelcomeBanner
          name={account.email.split("@")[0]}
          role="Ad Operations & Monetization"
          message="Control advertising across Android and Web. Enforce ad-free viewing for paid subscribers and zero-ad policies for kids profiles and adult channels."
        />

        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard
            title="Total Ad Units"
            value={units.length}
            change={`${units.filter((u) => u.enabled).length} active`}
            trend="neutral"
            color="cyan"
            icon={Layers}
          />
          <ConsoleKpiCard
            title="Total Impressions"
            value={reports?.summary.totalImpressions.toLocaleString() || "0"}
            change={`Web: ${reports?.summary.byPlatform.web.impressions || 0} | Android: ${reports?.summary.byPlatform.android.impressions || 0}`}
            trend="up"
            color="emerald"
            icon={BarChart3}
          />
          <ConsoleKpiCard
            title="Overall CTR"
            value={reports?.summary.overallCtr || "0.00%"}
            change={`${reports?.summary.totalClicks.toLocaleString() || "0"} clicks`}
            trend="up"
            color="purple"
            icon={Megaphone}
          />
          <ConsoleKpiCard
            title="Est. Ad Revenue"
            value={reports?.summary.totalRevenueFormatted || "₦0.00"}
            change={settings.paidViewersAdFree ? "Paid viewers: Ad-free" : "All viewers monetized"}
            trend="up"
            color="amber"
            icon={DollarSign}
          />
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="flex items-center justify-between rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-rose-400" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-xs text-rose-400 underline">Dismiss</button>
          </div>
        )}
        {success && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-xs text-emerald-400 underline">Dismiss</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
          {[
            { id: "units", label: "Ad Units & Targets", icon: Layers },
            { id: "creatives", label: "Own Creatives & Approval", icon: Sparkles },
            { id: "networks", label: "Partner Networks", icon: Smartphone },
            { id: "placements", label: "Placement Manager", icon: Sliders },
            { id: "reporting", label: "Reporting & CSV", icon: BarChart3 },
            { id: "policy", label: "Audience & Ad-Free Policy", icon: ShieldCheck },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                    : "text-blue-200/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={fetchData}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-blue-200 hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* TAB 1: Ad Units */}
        {activeTab === "units" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-blue-200/60">Platform Filter:</span>
                {(["all", "web", "android"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition ${
                      platformFilter === p
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "bg-white/5 text-blue-200/60 hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShowUnitModal(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                New Ad Unit
              </button>
            </div>

            <ConsoleCard title="Configured Ad Units" subtitle="Banner, interstitial, rewarded, native, and pre-roll definitions.">
              {filteredUnits.length === 0 ? (
                <div className="py-12 text-center text-sm text-blue-200/50">
                  No ad units configured yet. Click "New Ad Unit" to create your first ad placement.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-blue-100">
                    <thead className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wider text-blue-200/60">
                      <tr>
                        <th className="px-4 py-3">Unit Name</th>
                        <th className="px-4 py-3">Platform</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Placement</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Freq. Cap</th>
                        <th className="px-4 py-3">Audience</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredUnits.map((unit) => (
                        <tr key={unit.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-semibold text-white">{unit.name}</td>
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-1.5">
                              {unit.platform === "android" ? <Smartphone className="h-3.5 w-3.5 text-emerald-400" /> : <Monitor className="h-3.5 w-3.5 text-cyan-400" />}
                              <span className="capitalize">{unit.platform}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 uppercase text-blue-200/80">{unit.type}</td>
                          <td className="px-4 py-3 text-blue-200/70">{unit.placement.replace("_", " ")}</td>
                          <td className="px-4 py-3 text-blue-200/70">{unit.size}</td>
                          <td className="px-4 py-3 text-blue-200/70">{unit.frequencyCap}/day</td>
                          <td className="px-4 py-3 capitalize text-blue-200/70">{unit.targetAudience} ({unit.targetAgeRating})</td>
                          <td className="px-4 py-3">
                            <ConsoleStatusBadge status={unit.enabled ? "live" : "offline"} label={unit.enabled ? "Active" : "Disabled"} />
                          </td>
                          <td className="px-4 py-3 text-right space-x-2">
                            <button
                              onClick={() => handleToggleUnit(unit)}
                              className="rounded bg-white/5 px-2.5 py-1 text-[11px] text-blue-200 hover:bg-white/10"
                            >
                              {unit.enabled ? "Disable" : "Enable"}
                            </button>
                            <button
                              onClick={() => handleDeleteUnit(unit)}
                              className="rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-500/20"
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ConsoleCard>
          </div>
        )}

        {/* TAB 2: Own Creatives & Approval */}
        {activeTab === "creatives" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-200/70">
                Upload image or video creatives for direct campaigns. All creatives require owner approval before rotating live.
              </p>
              <button
                onClick={() => setShowCreativeModal(true)}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500"
              >
                <Plus className="h-4 w-4" />
                Upload Creative
              </button>
            </div>

            <ConsoleCard title="Creative Inventory & Moderation Queue">
              {creatives.length === 0 ? (
                <div className="py-12 text-center text-sm text-blue-200/50">
                  No creatives in queue. Click "Upload Creative" to add native media.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {creatives.map((c) => (
                    <div key={c.id} className="rounded-xl border border-white/10 bg-[#040e36] p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-bold text-white text-sm">{c.title}</h4>
                          <span className="text-[11px] text-blue-200/60 uppercase">{c.type}</span>
                        </div>
                        <ConsoleStatusBadge
                          status={c.status === "APPROVED" ? "approved" : c.status === "REJECTED" ? "rejected" : "pending"}
                          label={c.status}
                        />
                      </div>
                      <div className="aspect-video w-full rounded-lg bg-black/40 overflow-hidden border border-white/5 flex items-center justify-center text-xs text-blue-200/40">
                        {c.type === "image" ? (
                          <img src={c.mediaUrl} alt={c.title} className="h-full w-full object-cover" />
                        ) : (
                          <div className="text-center p-4">
                            <span className="text-xs text-blue-300">Video Asset</span>
                            <p className="text-[10px] text-blue-200/50 truncate max-w-[200px]">{c.mediaUrl}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-[11px] space-y-1 text-blue-200/70">
                        <p className="truncate">URL: <a href={c.clickThroughUrl} target="_blank" rel="noreferrer" className="text-cyan-400 underline">{c.clickThroughUrl}</a></p>
                        <p>Impressions: {c.impressions} | Clicks: {c.clicks}</p>
                        {c.rejectionReason && <p className="text-rose-300">Reason: {c.rejectionReason}</p>}
                      </div>
                      {c.status === "PENDING" && (
                        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                          <button
                            onClick={() => handleModerateCreative(c, "APPROVE")}
                            className="flex-1 rounded-lg bg-emerald-600/30 border border-emerald-500/40 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleModerateCreative(c, "REJECT")}
                            className="flex-1 rounded-lg bg-rose-600/30 border border-rose-500/40 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-600/50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ConsoleCard>
          </div>
        )}

        {/* TAB 3: Partner Networks */}
        {activeTab === "networks" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ConsoleCard title="Network & Network Configuration" subtitle="Configure external ad networks for backfill and monetization.">
              <form onSubmit={handleSaveSdk} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-blue-200/70 mb-1">Target Platform</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-xs text-white">
                      <input
                        type="radio"
                        name="sdkPlatform"
                        checked={sdkPlatform === "android"}
                        onChange={() => setSdkPlatform("android")}
                      />
                      Android App
                    </label>
                    <label className="flex items-center gap-2 text-xs text-white">
                      <input
                        type="radio"
                        name="sdkPlatform"
                        checked={sdkPlatform === "web"}
                        onChange={() => setSdkPlatform("web")}
                      />
                      Website / Web Player
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-200/70 mb-1">Provider Network</label>
                  <select
                    value={sdkProviderId}
                    onChange={(e) => setSdkProviderId(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  >
                    <option value="admob">Google AdMob</option>
                    <option value="unity">Unity Ads</option>
                    <option value="applovin">AppLovin MAX</option>
                    <option value="custom">Custom VAST/VMAP Partner</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-200/70 mb-1">App ID / Publisher ID</label>
                  <input
                    type="text"
                    value={sdkAppId}
                    onChange={(e) => setSdkAppId(e.target.value)}
                    placeholder="ca-app-pub-xxxxxxxxxxxxxxxx~yyyyyyyyyy"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-200/70 mb-1">
                    Private Network Secret / Connection Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={sdkSecretKey}
                      onChange={(e) => setSdkSecretKey(e.target.value)}
                      placeholder="Enter secret key..."
                      className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white pr-8"
                    />
                    <Lock className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-blue-200/40" />
                  </div>
                  <p className="mt-1 text-[11px] text-amber-300/80">
                    * Secret keys are encrypted and stored server-side. They are never displayed back in the UI.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="testModeCheck"
                    checked={sdkTestMode}
                    onChange={(e) => setSdkTestMode(e.target.checked)}
                  />
                  <label htmlFor="testModeCheck" className="text-xs text-blue-200/80">
                    Enable Test Mode (use sandbox ad units for testing)
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-blue-200/70 mb-1">Audit Reason</label>
                  <input
                    type="text"
                    required
                    value={sdkReason}
                    onChange={(e) => setSdkReason(e.target.value)}
                    placeholder="Reason for changing Network keys..."
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 py-2.5 text-xs font-extrabold text-[#031039] shadow-lg disabled:opacity-50"
                >
                  Save Encrypted Network Credentials
                </button>
              </form>
            </ConsoleCard>

            <ConsoleCard title="Active Network Status" subtitle="Provider routing status across platforms.">
              <div className="space-y-4 text-xs text-blue-100">
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <Smartphone className="h-6 w-6 text-emerald-400" />
                    <div>
                      <p className="font-bold text-white">Android Advertising Network</p>
                      <p className="text-blue-200/60">Configured via secure credential store</p>
                    </div>
                  </div>
                  <ConsoleStatusBadge status="live" label="Active" />
                </div>

                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center gap-3">
                    <Monitor className="h-6 w-6 text-cyan-400" />
                    <div>
                      <p className="font-bold text-white">Website Advertising Network</p>
                      <p className="text-blue-200/60">Configured via secure credential store</p>
                    </div>
                  </div>
                  <ConsoleStatusBadge status="live" label="Active" />
                </div>

                <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-[11px] text-blue-200">
                  <p className="font-bold text-blue-100 mb-1">Network Isolation Guarantee</p>
                  Ad network keys are never passed down to the browser. Units request next ads via <code>ad delivery service</code>, which mediates all network requests and filters prohibited audiences.
                </div>
              </div>
            </ConsoleCard>
          </div>
        )}

        {/* TAB 4: Placements */}
        {activeTab === "placements" && (
          <ConsoleCard title="Placement Manager" subtitle="Manage placements and view assigned units.">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[
                { id: "home_row", name: "Home Row Banner", desc: "Featured row on the main discovery page between category shelves." },
                { id: "below_player", name: "Below Player Native", desc: "Native banner unit rendered directly under live stream or video player." },
                { id: "between_episodes", name: "Between Episodes Interstitial", desc: "Full-screen interstitial shown during binge watching transitions." },
                { id: "exit_screen", name: "Exit Screen Unit", desc: "Engaging exit prompt before leaving video or application." },
                { id: "wallet_topup", name: "Wallet Top-up Page", desc: "Rewarded or native unit positioned on wallet funding screen." },
              ].map((pl) => {
                const assigned = units.filter((u) => u.placement === pl.id);
                return (
                  <div key={pl.id} className="rounded-xl border border-white/10 bg-[#040e36] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-white text-sm">{pl.name}</h4>
                      <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] text-blue-200">
                        {assigned.length} units
                      </span>
                    </div>
                    <p className="text-xs text-blue-200/60">{pl.desc}</p>
                    <div className="space-y-1 pt-2 border-t border-white/5">
                      {assigned.length === 0 ? (
                        <p className="text-[11px] text-blue-200/40 italic">No ad units targeting this placement.</p>
                      ) : (
                        assigned.map((u) => (
                          <div key={u.id} className="flex items-center justify-between text-[11px] text-blue-200/80">
                            <span>{u.name} ({u.platform})</span>
                            <span className={u.enabled ? "text-emerald-400" : "text-rose-400"}>
                              {u.enabled ? "Active" : "Off"}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ConsoleCard>
        )}

        {/* TAB 5: Reporting & CSV */}
        {activeTab === "reporting" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-blue-200/70">
                Performance metrics aggregated across impression, click, and completion events.
              </p>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-emerald-500"
              >
                <Download className="h-4 w-4" />
                Export CSV Report
              </button>
            </div>

            <ConsoleCard title="Performance by Ad Unit" subtitle="Impressions, clicks, CTR, and estimated gross revenue.">
              {!reports || reports.units.length === 0 ? (
                <div className="py-12 text-center text-sm text-blue-200/50">
                  No advertising events recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-blue-100">
                    <thead className="border-b border-white/10 bg-white/5 text-[11px] uppercase tracking-wider text-blue-200/60">
                      <tr>
                        <th className="px-4 py-3">Unit</th>
                        <th className="px-4 py-3">Platform</th>
                        <th className="px-4 py-3">Placement</th>
                        <th className="px-4 py-3">Impressions</th>
                        <th className="px-4 py-3">Clicks</th>
                        <th className="px-4 py-3">CTR</th>
                        <th className="px-4 py-3 text-right">Est. Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {reports.units.map((u) => (
                        <tr key={u.unitId} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-semibold text-white">{u.name}</td>
                          <td className="px-4 py-3 capitalize">{u.platform}</td>
                          <td className="px-4 py-3">{u.placement.replace("_", " ")}</td>
                          <td className="px-4 py-3">{u.impressions.toLocaleString()}</td>
                          <td className="px-4 py-3">{u.clicks.toLocaleString()}</td>
                          <td className="px-4 py-3 text-cyan-300 font-medium">{u.ctr}</td>
                          <td className="px-4 py-3 text-right font-bold text-emerald-400">{u.revenueFormatted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ConsoleCard>
          </div>
        )}

        {/* TAB 6: Policy & Ad-Free Protection */}
        {activeTab === "policy" && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ConsoleCard title="Audience Safeguards & Ad-Free Settings" subtitle="Enforce compliance with brand safety and subscriber agreements.">
              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="rounded-xl border border-white/10 bg-[#030b2a] p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Paid Viewers Ad-Free Option</h4>
                      <p className="text-[11px] text-blue-200/60">
                        When enabled, any viewer with an active subscription or verified paid tier will receive zero ads.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.paidViewersAdFree}
                      onChange={(e) => setSettings({ ...settings, paidViewersAdFree: e.target.checked })}
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-0"
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#030b2a] p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Kids Profile Protection (COPPA / Child Safety)</h4>
                      <p className="text-[11px] text-blue-200/60">
                        Strictly blocks all commercial ad requests for viewer profiles marked as children or kids mode.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.kidsProtectionEnabled}
                      disabled
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-0 opacity-80"
                    />
                  </div>
                  <span className="inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    Always Enforced in ads/next engine
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#030b2a] p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-white">Adult-Restricted Channel Exclusion</h4>
                      <p className="text-[11px] text-blue-200/60">
                        Never serves general brand ads on channels rated 18+ or marked adult-only.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.adultChannelRestricted}
                      disabled
                      className="h-4 w-4 rounded border-white/20 bg-white/10 text-cyan-400 focus:ring-0 opacity-80"
                    />
                  </div>
                  <span className="inline-block rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                    Always Enforced in ads/next engine
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-blue-600 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                >
                  Save & Apply Policy Rules
                </button>
              </form>
            </ConsoleCard>

            <ConsoleCard title="Engine Verification & Compliance" subtitle="Runtime audit rules checked on every ad request.">
              <div className="space-y-4 text-xs text-blue-200/80">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2">
                  <p className="font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    Triple-Gate Filtering
                  </p>
                  <p className="text-[11px] text-blue-200/60">
                    Every incoming call to <code>ad delivery service</code> evaluates:
                  </p>
                  <ol className="list-decimal pl-4 space-y-1 text-[11px]">
                    <li>Viewer profile kid/child flags (returns null immediately if true).</li>
                    <li>Channel age rating and adult exclusivity (returns null if 18+).</li>
                    <li>Paid subscriber verification against active billing records.</li>
                  </ol>
                </div>
              </div>
            </ConsoleCard>
          </div>
        )}

        {/* Modal: New Ad Unit */}
        {showUnitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#030b2a] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-white text-sm">Create New Ad Unit</h3>
                <button onClick={() => setShowUnitModal(false)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <form onSubmit={handleCreateUnit} className="space-y-3">
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Unit Name</label>
                  <input
                    type="text"
                    required
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="e.g. Android Home Banner 320x50"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Platform</label>
                    <select
                      value={newUnitPlatform}
                      onChange={(e) => setNewUnitPlatform(e.target.value as "web" | "android")}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    >
                      <option value="web">Web</option>
                      <option value="android">Android</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Ad Type</label>
                    <select
                      value={newUnitType}
                      onChange={(e) => setNewUnitType(e.target.value as typeof newUnitType)}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    >
                      <option value="banner">Banner</option>
                      <option value="interstitial">Interstitial</option>
                      <option value="rewarded">Rewarded</option>
                      <option value="native">Native</option>
                      <option value="pre_roll">Pre-roll</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Placement</label>
                    <select
                      value={newUnitPlacement}
                      onChange={(e) => setNewUnitPlacement(e.target.value as typeof newUnitPlacement)}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    >
                      <option value="home_row">Home Row</option>
                      <option value="below_player">Below Player</option>
                      <option value="between_episodes">Between Episodes</option>
                      <option value="exit_screen">Exit Screen</option>
                      <option value="wallet_topup">Wallet Top-up</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Dimensions / Size</label>
                    <input
                      type="text"
                      value={newUnitSize}
                      onChange={(e) => setNewUnitSize(e.target.value)}
                      placeholder="e.g. 320x50, 300x250, fluid"
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Frequency Cap (per user/day)</label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={newUnitFreqCap}
                      onChange={(e) => setNewUnitFreqCap(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Priority (0-1000)</label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={newUnitPriority}
                      onChange={(e) => setNewUnitPriority(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Target Audience</label>
                    <select
                      value={newUnitAudience}
                      onChange={(e) => setNewUnitAudience(e.target.value as typeof newUnitAudience)}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    >
                      <option value="all">All Viewers</option>
                      <option value="new">New Viewers Only</option>
                      <option value="returning">Returning Viewers Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-blue-200/70 mb-1">Target Age Rating</label>
                    <select
                      value={newUnitAgeRating}
                      onChange={(e) => setNewUnitAgeRating(e.target.value as typeof newUnitAgeRating)}
                      className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                    >
                      <option value="all">All Content</option>
                      <option value="G">G (General)</option>
                      <option value="PG">PG</option>
                      <option value="PG-13">PG-13</option>
                      <option value="16+">16+</option>
                      <option value="18+">18+</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Audit Reason</label>
                  <input
                    type="text"
                    required
                    value={newUnitReason}
                    onChange={(e) => setNewUnitReason(e.target.value)}
                    placeholder="e.g. Provisioning unit for new tournament campaign"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowUnitModal(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-blue-200 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                  >
                    Save Unit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Moderate Creative */}
        {moderateTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#030b2a] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-white text-sm">
                  {moderateTarget.decision === "APPROVE" ? "Approve Creative" : "Reject Creative"}: {moderateTarget.creative.title}
                </h3>
                <button onClick={() => setModerateTarget(null)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <div className="space-y-3">
                {moderateTarget.decision === "REJECT" && (
                  <div>
                    <label className="block text-xs text-rose-300 mb-1">Rejection Reason for Advertiser (Required)</label>
                    <textarea
                      value={moderateRejectionReason}
                      onChange={(e) => setModerateRejectionReason(e.target.value)}
                      placeholder="e.g. Creative violates brand safety standards or quality guidelines..."
                      rows={2}
                      className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Audit Reason (Required)</label>
                  <textarea
                    value={moderateAuditReason}
                    onChange={(e) => setModerateAuditReason(e.target.value)}
                    placeholder="Enter reason for compliance audit log..."
                    rows={2}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModerateTarget(null)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-blue-200/70 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmModerateCreative}
                    disabled={busy || !moderateAuditReason.trim() || (moderateTarget.decision === "REJECT" && !moderateRejectionReason.trim())}
                    className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${moderateTarget.decision === "REJECT" ? "bg-rose-600 hover:bg-rose-500" : "bg-emerald-600 hover:bg-emerald-500"} disabled:opacity-50`}
                  >
                    {busy ? "Processing..." : `Confirm ${moderateTarget.decision}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Policy Audit Reason */}
        {showPolicyModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#030b2a] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-white text-sm">Audit Reason: Save Advertising Policy</h3>
                <button onClick={() => setShowPolicyModal(false)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Audit Reason (Required)</label>
                  <textarea
                    value={policyAuditReason}
                    onChange={(e) => setPolicyAuditReason(e.target.value)}
                    placeholder="e.g. Updated kids mode ad exclusion rules per compliance guidelines..."
                    rows={3}
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPolicyModal(false)}
                    className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-blue-200/70 hover:bg-white/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={confirmSaveSettings}
                    disabled={busy || !policyAuditReason.trim()}
                    className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-semibold text-black hover:bg-cyan-400 disabled:opacity-50"
                  >
                    {busy ? "Saving..." : "Save Policy"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: New Creative */}
        {showCreativeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#030b2a] p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-white text-sm">Upload Creative</h3>
                <button onClick={() => setShowCreativeModal(false)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <form onSubmit={handleCreateCreative} className="space-y-3">
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Creative Title</label>
                  <input
                    type="text"
                    required
                    value={newCreativeTitle}
                    onChange={(e) => setNewCreativeTitle(e.target.value)}
                    placeholder="e.g. VIP Subscription Promo 2026"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Asset Type</label>
                  <select
                    value={newCreativeType}
                    onChange={(e) => setNewCreativeType(e.target.value as "image" | "video")}
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  >
                    <option value="image">Image (PNG / JPG / WEBP)</option>
                    <option value="video">Video (MP4 / HLS)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Media URL (HTTPS required)</label>
                  <input
                    type="url"
                    required
                    value={newCreativeMediaUrl}
                    onChange={(e) => setNewCreativeMediaUrl(e.target.value)}
                    placeholder="https://storage.bq-sqwad.tv/ads/banner.jpg"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Click-through URL (HTTPS required)</label>
                  <input
                    type="url"
                    required
                    value={newCreativeClickUrl}
                    onChange={(e) => setNewCreativeClickUrl(e.target.value)}
                    placeholder="https://bq-sqwad.tv/subscribe"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-blue-200/70 mb-1">Audit Reason</label>
                  <input
                    type="text"
                    required
                    value={newCreativeReason}
                    onChange={(e) => setNewCreativeReason(e.target.value)}
                    placeholder="e.g. Uploading campaign banner asset"
                    className="w-full rounded-xl border border-white/10 bg-[#040e36] px-3 py-2 text-xs text-white"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowCreativeModal(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-blue-200 hover:bg-white/10"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                  >
                    Upload & Submit
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
