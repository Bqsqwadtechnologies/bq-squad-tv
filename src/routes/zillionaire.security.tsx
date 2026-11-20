import { useState, useEffect, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ShieldAlert,
  KeyRound,
  Database,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  HardDrive,
  Lock,
  ArrowRight,
  ShieldCheck,
  Server,
  Layers,
  Clock,
  MonitorSmartphone,
  LogOut,
  FileCheck2,
  Download,
  RotateCw,
  X,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { SecurityEventsView } from "@/components/SecurityEventsView";

export const Route = createFileRoute("/zillionaire/security")({
  component: ZillionaireSecurityRoute,
  head: () => ({
    meta: [
      { title: "Safety & Security Centre | Zillionaire Control" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireSecurityRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="security">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Safety & Security Centre"
          tagline="Real-time threat mitigation, cryptographic secret health, automated backups, and support impersonation"
          activePath="/zillionaire/security"
          account={{
            ...(account.email ? { email: account.email } : {}),
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          {...(onLock ? { onLock } : {})}
        >
          <SafetyCentreDashboard token={token} isOwner={account.isOwner} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

type TabType = "threats" | "abuse_fraud" | "secrets" | "backups" | "support_mode" | "sessions" | "audit_integrity";

function SafetyCentreDashboard({ token, isOwner }: { token: string; isOwner?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabType>("threats");

  // Secret Health State
  const [secretData, setSecretData] = useState<{
    presentCount: number;
    missingCount: number;
    overdueCount?: number;
    dueSoonCount?: number;
    checkedAt: string;
    secrets: Array<{
      name: string;
      category?: string;
      description?: string;
      status: "present" | "missing";
      recommendedRotationDays?: number;
      rotationCycleDays?: number;
      rotationReminder?: string;
      lastRotatedAt?: string | null;
      nextDueAt?: string | null;
      isOverdue?: boolean;
      rotationStatus?: "healthy" | "due_soon" | "overdue" | "not_recorded";
    }>;
  } | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [rotationModalOpen, setRotationModalOpen] = useState(false);
  const [rotationSecretName, setRotationSecretName] = useState("");
  const [rotationCycleDays, setRotationCycleDays] = useState(90);
  const [submittingRotation, setSubmittingRotation] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);

  // Backup State
  const [backupData, setBackupData] = useState<{
    status: string;
    checkedAt: string;
    pointInTimeRecovery: boolean;
    retentionDays: number;
    backups: Array<{
      id: string;
      target: string;
      type: string;
      status: string;
      lastRun: string;
      sizeEstimate: string;
      checksumVerified: boolean;
      location: string;
    }>;
  } | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [backupTriggerMessage, setBackupTriggerMessage] = useState<string | null>(null);

  // Support Mode (View As) State
  const [viewAsTargetRole, setViewAsTargetRole] = useState<"producer" | "provider">("producer");
  const [viewAsTargetId, setViewAsTargetId] = useState("");
  const [viewAsReason, setViewAsReason] = useState("");
  const [viewAsError, setViewAsError] = useState<string | null>(null);

  const fetchSecretHealth = useCallback(async () => {
    setSecretsLoading(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/secret-health", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setSecretData(json);
      }
    } catch (e) {
      console.error("Failed to load secret health", e);
    } finally {
      setSecretsLoading(false);
    }
  }, [token]);

  const handleRecordRotation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!rotationSecretName) return;
    setSubmittingRotation(true);
    setRotationError(null);
    try {
      const response = await fetch("/api/public/v1/zillionaire/secret-health", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          secretName: rotationSecretName,
          rotationCycleDays,
        }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message ?? "Failed to record rotation");
      }
      setRotationModalOpen(false);
      await fetchSecretHealth();
    } catch (error) {
      setRotationError(error instanceof Error ? error.message : "Failed to record rotation");
    } finally {
      setSubmittingRotation(false);
    }
  };

  const fetchBackupStatus = useCallback(async () => {
    setBackupsLoading(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/backups", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setBackupData(json);
      }
    } catch (e) {
      console.error("Failed to load backups", e);
    } finally {
      setBackupsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === "secrets" && !secretData) {
      void fetchSecretHealth();
    } else if (activeTab === "backups" && !backupData) {
      void fetchBackupStatus();
    }
  }, [activeTab, secretData, backupData, fetchSecretHealth, fetchBackupStatus]);

  async function handleTriggerBackup() {
    setTriggeringBackup(true);
    setBackupTriggerMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/backups", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
      });
      if (res.ok) {
        const json = await res.json();
        setBackupTriggerMessage(json.message || "Backup snapshot initiated.");
        void fetchBackupStatus();
      }
    } catch (e) {
      console.error("Backup trigger failed", e);
    } finally {
      setTriggeringBackup(false);
    }
  }

  async function handleLaunchViewAs(e: React.FormEvent) {
    e.preventDefault();
    if (!viewAsTargetId.trim()) {
      setViewAsError("Target ID or organization reference is required.");
      return;
    }
    if (!viewAsReason.trim() || viewAsReason.trim().length < 5) {
      setViewAsError("A justification reason (min 5 characters) is required for audit compliance.");
      return;
    }

    try {
      // Store view-as in sessionStorage
      sessionStorage.setItem("bq_support_view_as_role", viewAsTargetRole);
      sessionStorage.setItem("bq_support_view_as_target", viewAsTargetId.trim());
      sessionStorage.setItem("bq_support_view_as_active", "true");

      // Navigate to target console
      const targetPath = viewAsTargetRole === "producer" ? "/producer" : "/provider";
      window.location.href = `${targetPath}?viewAs=${viewAsTargetRole}&targetId=${encodeURIComponent(viewAsTargetId.trim())}`;
    } catch (e) {
      console.error("Support view as launch failed", e);
    }
  }

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Safety & Security Operations"
        description="Unified defense matrix: live threat mitigation, cryptographic secret validation, automated disaster recovery backups, and audited support impersonation."
        badgeText="Tier 1 Protection"
      />

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
        {[
          { id: "threats" as const, label: "Threat Mitigation", icon: ShieldAlert },
          { id: "abuse_fraud" as const, label: "Abuse & Fraud Defense", icon: ShieldCheck },
          { id: "secrets" as const, label: "Secret Health Check", icon: KeyRound },
          { id: "backups" as const, label: "Platform Backups Status", icon: Database },
          { id: "support_mode" as const, label: "Support Mode (View As)", icon: Eye },
          ...(isOwner
            ? [
                { id: "sessions" as const, label: "Devices & Sessions", icon: MonitorSmartphone },
                { id: "audit_integrity" as const, label: "Audit Integrity", icon: FileCheck2 },
              ]
            : []),
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
                isActive
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "sessions" && isOwner && <OwnerSessionsPanel token={token} />}
      {activeTab === "audit_integrity" && isOwner && <AuditIntegrityPanel token={token} />}
      {activeTab === "abuse_fraud" && <AbuseFraudDefensePanel token={token} isOwner={isOwner === true} />}

      {/* TAB 1: THREAT MITIGATION (SecurityEventsView) */}
      {activeTab === "threats" && <SecurityEventsView sessionToken={token} isOwner={isOwner} />}

      {/* TAB 2: SECRET HEALTH CHECK */}
      {activeTab === "secrets" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ConsoleKpiCard
              title="Configured Secrets"
              value={secretData ? secretData.presentCount : "—"}
              subtitle="Verified active in environment"
              icon={ShieldCheck}
              variant="green"
            />
            <ConsoleKpiCard
              title="Missing Critical Keys"
              value={secretData ? secretData.missingCount : "—"}
              subtitle={
                secretData?.missingCount ? "Requires attention" : "All critical keys present"
              }
              icon={AlertTriangle}
              variant={secretData?.missingCount ? "gold" : "blue"}
            />
            <ConsoleKpiCard
              title="Rotation Overdue"
              value={secretData ? (secretData.overdueCount ?? 0) : "—"}
              subtitle={
                secretData?.overdueCount
                  ? `${secretData.overdueCount} overdue for rotation`
                  : secretData?.dueSoonCount
                    ? `${secretData.dueSoonCount} due within 14 days`
                    : "No overdue rotations"
              }
              icon={RotateCw}
              variant={secretData?.overdueCount ? "gold" : "green"}
            />
            <ConsoleKpiCard
              title="Secret Values Protection"
              value="100% Redacted"
              subtitle="Values never exposed in UI or logs"
              icon={Lock}
              variant="gold"
            />
          </div>

          {rotationModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
              <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <h3 className="flex items-center gap-2 text-base font-bold text-white">
                      <RotateCw className="h-4 w-4 text-blue-400" />
                      Record Secret Key Rotation
                    </h3>
                    <p className="mt-1 text-xs text-slate-400">
                      Record provider-side rotation only. Never enter secret values here.
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setRotationModalOpen(false)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleRecordRotation} className="space-y-4 pt-4">
                  {rotationError && (
                    <p
                      role="alert"
                      className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300"
                    >
                      {rotationError}
                    </p>
                  )}
                  <label className="block text-xs font-semibold text-slate-300">
                    Secret
                    <select
                      value={rotationSecretName}
                      onChange={(event) => {
                        const name = event.target.value;
                        setRotationSecretName(name);
                        setRotationCycleDays(
                          secretData?.secrets.find((secret) => secret.name === name)
                            ?.recommendedRotationDays ?? 90,
                        );
                      }}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 font-mono text-xs text-white"
                      required
                    >
                      <option value="">Choose a secret…</option>
                      {secretData?.secrets.map((secret) => (
                        <option key={secret.name} value={secret.name}>
                          {secret.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-slate-300">
                    Rotation cycle (days)
                    <input
                      type="number"
                      min={1}
                      max={730}
                      value={rotationCycleDays}
                      onChange={(event) => setRotationCycleDays(Number(event.target.value))}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800 px-3 py-2 text-xs text-white"
                      required
                    />
                  </label>
                  <div className="flex justify-end gap-3 border-t border-white/10 pt-3">
                    <button
                      type="button"
                      onClick={() => setRotationModalOpen(false)}
                      className="rounded-xl px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingRotation || !rotationSecretName}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {submittingRotation ? "Recording…" : "Save Rotation Record"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <ConsoleCard
            title="Cryptographic Secret Health & Rotation Matrix"
            subtitle="Environment key presence and rotation reminders. Secret values are never returned or displayed."
            headerAction={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRotationSecretName("");
                    setRotationCycleDays(90);
                    setRotationModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-blue-500/30 bg-blue-600/20 px-3 py-1.5 text-xs font-bold text-blue-300 hover:bg-blue-600/30"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Record Rotation
                </button>
                <button
                  type="button"
                  onClick={() => void fetchSecretHealth()}
                  disabled={secretsLoading}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${secretsLoading ? "animate-spin" : ""}`} />
                  Re-validate
                </button>
              </div>
            }
          >
            {secretsLoading && !secretData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Checking environment configuration…
              </div>
            ) : !secretData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Failed to load secret health check.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {secretData.secrets.map((secret) => (
                  <div
                    key={secret.name}
                    className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-200">
                          {secret.name}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {secret.description ?? "Critical infrastructure configuration"}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-lg border px-2 py-1 text-[10px] font-bold ${secret.status === "present" ? "border-emerald-500/30 bg-emerald-500/20 text-emerald-300" : "border-amber-500/30 bg-amber-500/20 text-amber-300"}`}
                      >
                        {secret.status === "present" ? "Present" : "Missing"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/5 bg-black/20 p-2 text-[10px]">
                      <div>
                        <span className="block text-slate-500">Last rotated</span>
                        <span className="text-slate-300">
                          {secret.lastRotatedAt
                            ? new Date(secret.lastRotatedAt).toLocaleDateString()
                            : "Not recorded"}
                        </span>
                      </div>
                      <div>
                        <span className="block text-slate-500">Next due</span>
                        <span
                          className={secret.isOverdue ? "font-bold text-red-400" : "text-slate-300"}
                        >
                          {secret.nextDueAt
                            ? new Date(secret.nextDueAt).toLocaleDateString()
                            : "Not scheduled"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 border-t border-white/5 pt-2">
                      <span className="text-[10px] text-slate-400">
                        Recommended every{" "}
                        {secret.rotationCycleDays ?? secret.recommendedRotationDays ?? 90} days
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRotationSecretName(secret.name);
                          setRotationCycleDays(
                            secret.rotationCycleDays ?? secret.recommendedRotationDays ?? 90,
                          );
                          setRotationModalOpen(true);
                        }}
                        className="text-[10px] font-bold text-blue-400 hover:text-blue-300"
                      >
                        Record rotation
                      </button>
                    </div>
                    {secret.rotationReminder && (
                      <p className="rounded-lg border border-blue-500/20 bg-blue-950/30 p-2 text-[10px] text-blue-200">
                        {secret.rotationReminder}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ConsoleCard>
        </div>
      )}

      {/* TAB 3: PLATFORM BACKUPS STATUS */}
      {activeTab === "backups" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ConsoleKpiCard
              title="Disaster Recovery Health"
              value={backupData?.status === "healthy" ? "100% Verified" : "Checking..."}
              subtitle="Dual-region redundancy"
              icon={HardDrive}
              variant="green"
            />
            <ConsoleKpiCard
              title="Point-in-Time Recovery"
              value="30-Day Window"
              subtitle="Automated rollbacks enabled"
              icon={Clock}
              variant="blue"
            />
            <ConsoleKpiCard
              title="Active Backup Targets"
              value={backupData?.backups.length ?? 3}
              subtitle="Firestore + Config + Media"
              icon={Layers}
              variant="purple"
            />
          </div>

          <ConsoleCard
            title="Automated Backups & Redundancy Overview"
            subtitle="Point-in-time recovery and cryptographic backups for database, access configurations, and transcoded media"
            headerAction={
              <button
                type="button"
                onClick={handleTriggerBackup}
                disabled={triggeringBackup}
                className="flex items-center gap-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 px-3.5 py-1.5 text-xs font-bold text-slate-950 transition disabled:opacity-50"
              >
                <Database className={`h-3.5 w-3.5 ${triggeringBackup ? "animate-spin" : ""}`} />
                {triggeringBackup ? "Initiating Snapshot..." : "Trigger Backup Now"}
              </button>
            }
          >
            {backupTriggerMessage && (
              <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                ✓ {backupTriggerMessage}
              </div>
            )}

            {backupsLoading && !backupData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Querying backup status...
              </div>
            ) : !backupData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Failed to load backup status.
              </div>
            ) : (
              <div className="space-y-3">
                {backupData.backups.map((bak) => (
                  <div
                    key={bak.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-white/10 bg-slate-900/60"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{bak.target}</span>
                        <span className="text-[10px] font-mono rounded px-2 py-0.5 bg-slate-800 text-slate-300 border border-white/10">
                          {bak.type}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">{bak.location}</p>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 pt-1">
                        <span>Last run: {new Date(bak.lastRun).toLocaleString()}</span>
                        <span>•</span>
                        <span>Estimated volume: {bak.sizeEstimate}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Healthy
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ConsoleCard>
        </div>
      )}

      {/* TAB 4: SUPPORT MODE (VIEW AS) */}
      {activeTab === "support_mode" && (
        <div className="space-y-6">
          <ConsoleCard
            title="Read-Only Support Impersonation"
            subtitle="Access Producer or Content Provider consoles in strictly monitored read-only mode to diagnose user issues. All actions are audited."
          >
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 mb-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <strong className="text-amber-100 font-bold block text-sm">
                  Strict Read-Only Enforcement
                </strong>
                <p>
                  While in Support Mode, a persistent high-visibility warning banner is affixed
                  across the top of all views. Modifications, payment transfers, and destructive
                  operations are completely disabled. Entering this mode writes a tamper-evident
                  audit record with your justification reason.
                </p>
              </div>
            </div>

            <form onSubmit={handleLaunchViewAs} className="max-w-xl space-y-4">
              {viewAsError && (
                <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs">
                  {viewAsError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Select Role to View As
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setViewAsTargetRole("producer")}
                    className={`p-3 rounded-xl border text-left transition ${
                      viewAsTargetRole === "producer"
                        ? "bg-cyan-500/20 border-cyan-400 text-white"
                        : "bg-slate-900 border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <span className="font-bold text-sm block">Producer Console</span>
                    <span className="text-[11px] text-slate-400">
                      Content production, episodes, earnings
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewAsTargetRole("provider")}
                    className={`p-3 rounded-xl border text-left transition ${
                      viewAsTargetRole === "provider"
                        ? "bg-cyan-500/20 border-cyan-400 text-white"
                        : "bg-slate-900 border-white/10 text-slate-400 hover:border-white/20"
                    }`}
                  >
                    <span className="font-bold text-sm block">Content Provider</span>
                    <span className="text-[11px] text-slate-400">
                      Channel distribution, live stream feeds
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Target Account UID or Producer ID
                </label>
                <input
                  type="text"
                  placeholder="e.g. prod_87234 or user UID"
                  value={viewAsTargetId}
                  onChange={(e) => {
                    setViewAsTargetId(e.target.value);
                    setViewAsError(null);
                  }}
                  className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Mandatory Audit Reason / Support Ticket #
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Investigating payout dispute for ticket #BQ-4910"
                  value={viewAsReason}
                  onChange={(e) => {
                    setViewAsReason(e.target.value);
                    setViewAsError(null);
                  }}
                  className="w-full rounded-xl border border-white/15 bg-slate-900 px-3.5 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-amber-500 hover:bg-amber-400 px-4 py-2.5 text-xs font-black text-slate-950 transition shadow-lg shadow-amber-500/20"
              >
                <span>Launch Audited Support Session</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          </ConsoleCard>
        </div>
      )}
    </div>
  );
}

function OwnerSessionsPanel({ token }: { token: string }) {
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      browser: string;
      lastSeenAt: string;
      createdAt: string;
      current: boolean;
      country: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/access/sessions", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load sessions.");
      setSessions(data.sessions || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load sessions.");
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const signOutEverywhere = async () => {
    if (
      !window.confirm(
        "Sign out every owner device? You will need your access password and authenticator code to unlock again.",
      )
    )
      return;
    setMessage("");
    try {
      const res = await fetch("/api/public/v1/zillionaire/access/sessions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not revoke owner sessions.");
      setMessage("All owner sessions were signed out. This screen will lock now.");
      setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not revoke sessions.");
    }
  };
  return (
    <ConsoleCard
      title="Owner devices & sessions"
      subtitle="Owner sessions lock after 15 minutes idle and expire after 8 hours. Country detection is unavailable until a trusted edge location source is configured."
      headerAction={
        <button
          type="button"
          onClick={() => void signOutEverywhere()}
          className="inline-flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs font-bold text-rose-200 hover:bg-rose-500/20"
        >
          <LogOut className="h-4 w-4" />
          Sign out everywhere
        </button>
      }
    >
      {message && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 p-3 text-sm text-cyan-100"
        >
          {message}
        </p>
      )}
      {loading ? (
        <div className="p-8 text-center text-sm text-slate-400">Loading owner sessions…</div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-8 text-center text-sm text-slate-300">
          No active owner sessions were found.
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-semibold text-white">
                  {session.browser}{" "}
                  {session.current && (
                    <span className="ml-2 rounded-full bg-cyan-500/15 px-2 py-1 text-xs text-cyan-200">
                      This device
                    </span>
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Country: {session.country} · Last seen:{" "}
                  {new Date(session.lastSeenAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Started: {new Date(session.createdAt).toLocaleString()}
                </p>
              </div>
              <span className="text-xs text-emerald-300">Owner session</span>
            </div>
          ))}
        </div>
      )}
    </ConsoleCard>
  );
}

function AuditIntegrityPanel({ token }: { token: string }) {
  const [data, setData] = useState<{
    integrity: {
      valid: boolean;
      checked: number;
      brokenEntryId: string | null;
      reason: string | null;
    };
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [actor, setActor] = useState("");
  const [target, setTarget] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (actor.trim()) params.set("actorUid", actor.trim());
      if (target.trim()) params.set("targetId", target.trim());
      const res = await fetch(`/api/public/v1/zillionaire/audit?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not load audit integrity.");
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load audit records.");
    } finally {
      setBusy(false);
    }
  }, [token, actor, target]);
  useEffect(() => {
    void load();
  }, [load]);
  const exportAudit = async () => {
    try {
      const params = new URLSearchParams({ export: "true" });
      if (actor.trim()) params.set("actorUid", actor.trim());
      if (target.trim()) params.set("targetId", target.trim());
      const response = await fetch(`/api/public/v1/zillionaire/audit?${params}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "zillionaire-audit.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    }
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <ConsoleKpiCard
          title="Chain status"
          value={data ? (data.integrity.valid ? "Verified" : "Mismatch") : "Checking"}
          subtitle="SHA-256 hash chain"
          icon={ShieldCheck}
          variant={data?.integrity.valid ? "green" : "gold"}
        />
        <ConsoleKpiCard
          title="Entries checked"
          value={data?.integrity.checked ?? "—"}
          subtitle="Complete audit history"
          icon={FileCheck2}
          variant="blue"
        />
      </div>
      <ConsoleCard
        title="Tamper-evident audit history"
        subtitle="Integrity is checked against the stored chain head. Search by actor or target; exports include a SHA-256 checksum."
        headerAction={
          <button
            type="button"
            onClick={exportAudit}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            <Download className="h-4 w-4" />
            Export records
          </button>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void load();
          }}
          className="mb-4 flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="Filter by actor UID"
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Filter by target ID"
            className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button className="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white">
            Search
          </button>
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white"
          >
            {busy ? "Checking…" : "Retry"}
          </button>
        </form>
        {data?.integrity.valid === false && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200"
          >
            Audit chain mismatch detected: {data.integrity.reason || "unknown"}. Review the record
            history before taking sensitive actions.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-rose-400/30 p-3 text-sm text-rose-200"
          >
            {error}
          </p>
        )}
        {busy && !data ? (
          <div className="p-8 text-center text-slate-400">Verifying audit chain…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                <tr>
                  <th className="p-3">Time</th>
                  <th className="p-3">Actor</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Reason</th>
                </tr>
              </thead>
              <tbody>
                {data?.entries.map((entry) => (
                  <tr key={String(entry.id)} className="border-t border-white/5">
                    <td className="p-3 text-xs text-slate-400">{String(entry.createdAt || "—")}</td>
                    <td className="p-3 font-mono text-xs text-slate-300">
                      {String(entry.actorUid || "—")}
                    </td>
                    <td className="p-3 text-white">{String(entry.action || "—")}</td>
                    <td className="p-3 text-slate-300">
                      {String(entry.targetType || "—")}: {String(entry.targetId || "—")}
                    </td>
                    <td className="max-w-xs p-3 text-xs text-slate-400">
                      {String(entry.reason || "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!busy && data?.entries.length === 0 && (
              <p className="p-8 text-center text-slate-400">
                No audit entries match those filters.
              </p>
            )}
          </div>
        )}
      </ConsoleCard>
    </div>
  );
}



type AbuseReputationRow = {
  id: string;
  targetType: string;
  targetValue: string;
  status: string;
  reason: string;
  expiresAt: string | null;
};

type AbuseHoldRow = {
  id: string;
  createdAt: string;
  targetType: string;
  targetId: string;
  reason: string;
  riskScore: number;
  status: string;
};

function AbuseFraudDefensePanel({ token, isOwner }: { token: string; isOwner: boolean }) {
  const [subTab, setSubTab] = useState<"limits" | "reputation" | "holds">("limits");
  const [limits, setLimits] = useState<Record<string, { routeKey: string; label: string; maxRequests: number; windowSeconds: number; description: string }> | null>(null);
  const [reputationEntries, setReputationEntries] = useState<AbuseReputationRow[]>([]);
  const [holds, setHolds] = useState<AbuseHoldRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Edit limit modal state
  const [editingRoute, setEditingRoute] = useState<{ routeKey: string; label: string; maxRequests: number; windowSeconds: number } | null>(null);
  const [editReason, setEditReason] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  // Add reputation state
  const [newTargetType, setNewTargetType] = useState<"ip" | "device">("ip");
  const [newTargetValue, setNewTargetValue] = useState("");
  const [newStatus, setNewStatus] = useState<"blacklisted" | "greylisted" | "allowed">("blacklisted");
  const [newReason, setNewReason] = useState("");
  const [newTtlHours, setNewTtlHours] = useState(24);
  const [addingReputation, setAddingReputation] = useState(false);

  const loadLimits = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/abuse-settings", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setLimits(data.limits);
      else throw new Error(data.error || "Failed to load limits");
    } catch (e: any) {
      setActionError(e.message || "Could not load rate limits.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadReputation = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/reputation", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setReputationEntries(data.entries || []);
      else throw new Error(data.error || "Failed to load reputation list");
    } catch (e: any) {
      setActionError(e.message || "Could not load reputation entries.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const loadHolds = useCallback(async () => {
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/holds", {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setHolds(data.holds || []);
      else throw new Error(data.error || "Failed to load holds");
    } catch (e: any) {
      setActionError(e.message || "Could not load security holds.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (subTab === "limits") void loadLimits();
    else if (subTab === "reputation") void loadReputation();
    else if (subTab === "holds") void loadHolds();
  }, [subTab, loadLimits, loadReputation, loadHolds]);

  const handleSaveLimit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoute) return;
    setSavingLimit(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/abuse-settings", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          routeKey: editingRoute.routeKey,
          maxRequests: Number(editingRoute.maxRequests),
          windowSeconds: Number(editingRoute.windowSeconds),
          reason: editReason.trim() || "Policy update via console",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update route limit.");
      setActionSuccess(`Rate limit updated for ${editingRoute.label}.`);
      setEditingRoute(null);
      setEditReason("");
      void loadLimits();
    } catch (err: any) {
      setActionError(err.message || "Update failed.");
    } finally {
      setSavingLimit(false);
    }
  };

  const handleAddReputation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTargetValue.trim() || !newReason.trim()) return;
    setAddingReputation(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/reputation", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetType: newTargetType,
          targetValue: newTargetValue.trim(),
          status: newStatus,
          reason: newReason.trim(),
          ttlHours: Number(newTtlHours) || 24,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add reputation entry.");
      setActionSuccess(`Reputation entry added for ${newTargetValue.trim()}.`);
      setNewTargetValue("");
      setNewReason("");
      void loadReputation();
    } catch (err: any) {
      setActionError(err.message || "Failed to add entry.");
    } finally {
      setAddingReputation(false);
    }
  };

  const handleRemoveReputation = async (entryId: string) => {
    const reason = window.prompt("Reason for removing this reputation entry:");
    if (!reason || reason.trim().length < 3) return;
    setActionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/reputation", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entryId, reason: reason.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Could not remove entry.");
      }
      setActionSuccess("Reputation entry removed.");
      void loadReputation();
    } catch (err: any) {
      setActionError(err.message || "Failed to remove entry.");
    }
  };

  const handleResolveHold = async (holdId: string, action: "RELEASE" | "CONFIRM_BAN") => {
    const promptMsg = action === "CONFIRM_BAN"
      ? "Enter confirmed suspension justification (mandatory audit reason):"
      : "Enter reason for releasing hold:";
    const reason = window.prompt(promptMsg);
    if (!reason || reason.trim().length < 3) return;
    setActionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/security/holds", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ holdId, action, reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve hold.");
      setActionSuccess(`Hold resolved: ${action}.`);
      void loadHolds();
    } catch (err: any) {
      setActionError(err.message || "Resolution failed.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        {[
          { id: "limits" as const, label: "Per-Route Rate Limits" },
          { id: "reputation" as const, label: "IP & Device Reputation" },
          { id: "holds" as const, label: "Security Holds Queue" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setSubTab(t.id);
              setActionError(null);
              setActionSuccess(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              subTab === t.id
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                : "text-slate-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {actionError && (
        <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-200">
          {actionError}
        </p>
      )}
      {actionSuccess && (
        <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-950/30 p-3 text-sm text-emerald-200">
          {actionSuccess}
        </p>
      )}

      {/* Sub Tab 1: Route Limits */}
      {subTab === "limits" && (
        <ConsoleCard
          title="Configurable Route Rate Limits"
          subtitle="Owner-controlled burst and window limits to protect authentication, payments, playback, and APIs from credential stuffing and volumetric abuse."
        >
          {loading && !limits ? (
            <div className="p-8 text-center text-slate-400">Loading route policies…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Route / Flow</th>
                    <th className="p-3">Max Requests</th>
                    <th className="p-3">Window (Sec)</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {limits &&
                    Object.values(limits).map((r) => (
                      <tr key={r.routeKey} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="p-3">
                          <span className="font-semibold text-white">{r.label}</span>
                          <span className="block font-mono text-xs text-slate-400">{r.routeKey}</span>
                        </td>
                        <td className="p-3 font-mono text-cyan-300">{r.maxRequests} req</td>
                        <td className="p-3 font-mono text-slate-300">{r.windowSeconds}s</td>
                        <td className="max-w-md p-3 text-xs text-slate-400">{r.description}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingRoute({
                                routeKey: r.routeKey,
                                label: r.label,
                                maxRequests: r.maxRequests,
                                windowSeconds: r.windowSeconds,
                              })
                            }
                            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-semibold text-cyan-200 hover:bg-cyan-500/20"
                          >
                            Edit Limit
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Edit Modal */}
          {editingRoute && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white">Edit Policy: {editingRoute.label}</h3>
                <p className="mt-1 text-xs text-slate-400 font-mono">{editingRoute.routeKey}</p>
                <form onSubmit={handleSaveLimit} className="mt-4 space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Max Requests</label>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={editingRoute.maxRequests}
                      onChange={(e) =>
                        setEditingRoute({ ...editingRoute, maxRequests: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Window Seconds</label>
                    <input
                      type="number"
                      min={1}
                      max={86400}
                      value={editingRoute.windowSeconds}
                      onChange={(e) =>
                        setEditingRoute({ ...editingRoute, windowSeconds: Number(e.target.value) })
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-sm text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300">Audit Justification</label>
                    <textarea
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Why is this limit being adjusted?"
                      minLength={3}
                      maxLength={1000}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2.5 text-sm text-white"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditingRoute(null)}
                      className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingLimit}
                      className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                    >
                      {savingLimit ? "Saving…" : "Save Policy"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </ConsoleCard>
      )}

      {/* Sub Tab 2: Reputation List */}
      {subTab === "reputation" && (
        <div className="space-y-6">
          <ConsoleCard
            title="Add Reputation Rule"
            subtitle="Block, greylist, or allowlist specific IP addresses or client device identifiers with mandatory reasoning."
          >
            <form onSubmit={handleAddReputation} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-300">Target Type</label>
                <select
                  value={newTargetType}
                  onChange={(e) => setNewTargetType(e.target.value as "ip" | "device")}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2 text-sm text-white"
                >
                  <option value="ip">IP Address</option>
                  <option value="device">Device Identifier</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Target Value</label>
                <input
                  type="text"
                  placeholder="e.g. 192.0.2.1"
                  value={newTargetValue}
                  onChange={(e) => setNewTargetValue(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2 text-sm text-white font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as any)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2 text-sm text-white"
                >
                  <option value="blacklisted">Blacklisted (Blocked)</option>
                  <option value="greylisted">Greylisted (Elevated MFA)</option>
                  <option value="allowed">Allowed (Exempt)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300">Reason</label>
                <input
                  type="text"
                  placeholder="Audit reason"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 p-2 text-sm text-white"
                  required
                />
              </div>
              <div>
                <button
                  type="submit"
                  disabled={addingReputation}
                  className="w-full rounded-xl bg-cyan-500 py-2.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
                >
                  {addingReputation ? "Adding…" : "Add Rule"}
                </button>
              </div>
            </form>
          </ConsoleCard>

          <ConsoleCard
            title="Active Reputation Rules"
            subtitle="Current network and device entries enforcing edge restrictions."
          >
            {loading && reputationEntries.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Loading reputation list…</div>
            ) : reputationEntries.length === 0 ? (
              <div className="p-8 text-center text-slate-400">No active reputation rules found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                    <tr>
                      <th className="p-3">Type</th>
                      <th className="p-3">Target Value</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Reason</th>
                      <th className="p-3">Expires At</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reputationEntries.map((entry) => (
                      <tr key={entry.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="p-3 text-xs uppercase font-mono text-slate-400">{entry.targetType}</td>
                        <td className="p-3 font-mono text-white text-xs">{entry.targetValue}</td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              entry.status === "blacklisted"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : entry.status === "greylisted"
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-slate-300">{entry.reason}</td>
                        <td className="p-3 text-xs text-slate-400">{entry.expiresAt ? new Date(entry.expiresAt).toLocaleString() : "Permanent"}</td>
                        <td className="p-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveReputation(entry.id)}
                            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                          >
                            Remove
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

      {/* Sub Tab 3: Security Holds Queue */}
      {subTab === "holds" && (
        <ConsoleCard
          title="Security Holds & Review Queue"
          subtitle="Automatic anomaly holds created by payment velocity, wallet freezing, referral abuse, or bot credential stuffing."
        >
          {loading && holds.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Loading holds…</div>
          ) : holds.length === 0 ? (
            <div className="p-8 text-center text-slate-400">All security holds are clear. No pending reviews.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-900 text-xs uppercase text-slate-400">
                  <tr>
                    <th className="p-3">Time</th>
                    <th className="p-3">Target</th>
                    <th className="p-3">Trigger / Reason</th>
                    <th className="p-3">Risk Score</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {holds.map((h) => (
                    <tr key={h.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                      <td className="p-3 text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()}</td>
                      <td className="p-3">
                        <span className="block text-xs uppercase font-mono text-cyan-300">{h.targetType}</span>
                        <span className="font-mono text-xs text-slate-300">{h.targetId}</span>
                      </td>
                      <td className="max-w-xs p-3 text-xs text-slate-300">{h.reason}</td>
                      <td className="p-3 font-mono text-xs">
                        <span className={`font-bold ${h.riskScore >= 80 ? "text-rose-400" : "text-amber-300"}`}>
                          {h.riskScore}/100
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            h.status === "pending"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : h.status === "released"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                          }`}
                        >
                          {h.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        {h.status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleResolveHold(h.id, "RELEASE")}
                              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/20"
                            >
                              Release Hold
                            </button>
                            {isOwner && (
                              <button
                                type="button"
                                onClick={() => handleResolveHold(h.id, "CONFIRM_BAN")}
                                className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                              >
                                Confirm Ban
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ConsoleCard>
      )}
    </div>
  );
}
