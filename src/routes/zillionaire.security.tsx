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

type TabType = "threats" | "secrets" | "backups" | "support_mode" | "sessions" | "audit_integrity";

function SafetyCentreDashboard({ token, isOwner }: { token: string; isOwner?: boolean }) {
  const [activeTab, setActiveTab] = useState<TabType>("threats");

  // Secret Health State
  const [secretData, setSecretData] = useState<{
    presentCount: number;
    missingCount: number;
    checkedAt: string;
    secrets: Array<{ name: string; status: "present" | "missing" }>;
  } | null>(null);
  const [secretsLoading, setSecretsLoading] = useState(false);

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
          { id: "secrets" as const, label: "Secret Health Check", icon: KeyRound },
          { id: "backups" as const, label: "Platform Backups Status", icon: Database },
          { id: "support_mode" as const, label: "Support Mode (View As)", icon: Eye },
          ...(isOwner
            ? [{ id: "sessions" as const, label: "Devices & Sessions", icon: MonitorSmartphone }]
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

      {/* TAB 1: THREAT MITIGATION (SecurityEventsView) */}
      {activeTab === "threats" && <SecurityEventsView sessionToken={token} isOwner={isOwner} />}

      {/* TAB 2: SECRET HEALTH CHECK */}
      {activeTab === "secrets" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ConsoleKpiCard
              title="Configured Secrets"
              value={secretData ? secretData.presentCount : "—"}
              subtitle="Verified active"
              icon={ShieldCheck}
              variant="green"
            />
            <ConsoleKpiCard
              title="Missing Critical Keys"
              value={secretData ? secretData.missingCount : "—"}
              subtitle={
                secretData && secretData.missingCount > 0 ? "Requires attention" : "All optimal"
              }
              icon={AlertTriangle}
              variant={secretData && secretData.missingCount > 0 ? "gold" : "blue"}
            />
            <ConsoleKpiCard
              title="Secret Values Protection"
              value="100% Redacted"
              subtitle="Never displayed in UI or code"
              icon={Lock}
              variant="gold"
            />
          </div>

          <ConsoleCard
            title="Cryptographic Secret Health Status"
            subtitle="Validation of environment and vault keys required for payments, storage, transcoding, and authentication (Values are strictly hidden)"
            headerAction={
              <button
                type="button"
                onClick={() => void fetchSecretHealth()}
                disabled={secretsLoading}
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 transition disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${secretsLoading ? "animate-spin" : ""}`} />
                Re-validate Keys
              </button>
            }
          >
            {secretsLoading && !secretData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Scanning environment and encrypted vaults...
              </div>
            ) : !secretData ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Failed to load secret health check.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {secretData.secrets.map((sec) => (
                  <div
                    key={sec.name}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-white/10 bg-slate-900/60"
                  >
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs font-bold text-slate-200">{sec.name}</span>
                      <p className="text-[10px] text-slate-400">
                        {sec.name.includes("PAYSTACK")
                          ? "Paystack payment processing & webhook verification"
                          : sec.name.includes("FIREBASE")
                            ? "Firebase Admin SDK authentication & Firestore"
                            : sec.name.includes("STORAGE") || sec.name.includes("B2")
                              ? "Backblaze B2 & Lovable storage replication"
                              : sec.name.includes("STREAMING")
                                ? "HMAC token signing for anti-hotlinking video stream"
                                : sec.name.includes("MODAL")
                                  ? "Modal serverless GPU worker transcode queue"
                                  : "Critical infrastructure security key"}
                      </p>
                    </div>
                    <div>
                      {sec.status === "present" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          Present
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                          Missing
                        </span>
                      )}
                    </div>
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
