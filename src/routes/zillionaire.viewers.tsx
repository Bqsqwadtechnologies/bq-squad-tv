import { useState, useEffect, useMemo, FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleTable,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import {
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserX,
  UserCheck,
  X,
  KeyRound,
  History,
  Activity,
  Lock,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/viewers")({
  component: ZillionaireViewersRoute,
  head: () => ({
    meta: [
      { title: "Viewer 360 | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ViewerAccount {
  id: string;
  email: string;
  displayName: string;
  suspended: boolean;
  createdAt: string | null;
  roleTags: string[];
  riskScore: number;
}

interface RiskDetails {
  score: number;
  level: string;
  counts: Record<string, number>;
}

function ZillionaireViewersRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="users">
      {({ token, account, onLock }) => (
        <ZillionaireViewersContent token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireViewersContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [viewers, setViewers] = useState<ViewerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Inspect Modal State
  const [selectedViewer, setSelectedViewer] = useState<ViewerAccount | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "risk" | "actions">("profile");
  const [riskDetails, setRiskDetails] = useState<RiskDetails | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  // Action states
  const [actionReason, setActionReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const fetchViewers = async (query = "") => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const url = query
        ? `/api/public/v1/zillionaire/users?q=${encodeURIComponent(query)}`
        : "/api/public/v1/zillionaire/users";
      const res = await fetch(url, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load viewers");
      setViewers(data.users || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading viewers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchViewers(searchQuery);
  }, [token]);

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    void fetchViewers(searchQuery);
  };

  const handleInspect = async (v: ViewerAccount) => {
    setSelectedViewer(v);
    setActiveTab("profile");
    setActionReason("");
    setActionError("");
    setRiskDetails(null);

    // Fetch risk profile
    setRiskLoading(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/users/${v.id}/risk`, { headers });
      const data = await res.json();
      if (res.ok && data) {
        setRiskDetails({
          score: data.score || 0,
          level: data.level || "low",
          counts: data.counts || {},
        });
      }
    } catch {
      // Risk lookup optional
    } finally {
      setRiskLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!selectedViewer) return;
    if (!actionReason.trim()) {
      setActionError("An audit reason is required for account status modifications.");
      return;
    }

    const nextStatus = selectedViewer.suspended ? "ACTIVE" : "SUSPENDED";
    setActionBusy(true);
    setActionError("");
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch(`/api/public/v1/zillionaire/users/${selectedViewer.id}/status`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          status: nextStatus,
          reason: actionReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");

      setSuccessMessage(
        `User ${selectedViewer.email} status changed to ${nextStatus}. Audit logged.`,
      );
      setSelectedViewer((prev) =>
        prev ? { ...prev, suspended: nextStatus === "SUSPENDED" } : null,
      );
      void fetchViewers(searchQuery);
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Error executing status change");
    } finally {
      setActionBusy(false);
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const total = viewers.length;
    const active = viewers.filter((v) => !v.suspended).length;
    const suspended = viewers.filter((v) => v.suspended).length;
    const highRisk = viewers.filter((v) => v.riskScore > 50).length;
    return { total, active, suspended, highRisk };
  }, [viewers]);

  const filteredViewers = useMemo(() => {
    return viewers.filter((v) => {
      if (statusFilter === "active" && v.suspended) return false;
      if (statusFilter === "suspended" && !v.suspended) return false;
      return true;
    });
  }, [viewers, statusFilter]);

  const columns = [
    {
      key: "email",
      header: "Viewer Account",
      sortable: true,
      render: (v: ViewerAccount) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-cyan-300 shrink-0">
            {v.displayName
              ? v.displayName.slice(0, 2).toUpperCase()
              : v.email.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-white text-xs truncate">
              {v.displayName || "Viewer"}
            </span>
            <span className="text-[11px] text-slate-400 font-mono truncate">{v.email}</span>
          </div>
        </div>
      ),
    },
    {
      key: "roleTags",
      header: "Roles",
      render: (v: ViewerAccount) => (
        <div className="flex flex-wrap gap-1">
          {v.roleTags.length > 0 ? (
            v.roleTags.map((tag) => (
              <span
                key={tag}
                className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-950/70 border border-blue-500/30 text-blue-300"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="text-[10px] text-slate-500 font-mono">viewer</span>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Account Status",
      render: (v: ViewerAccount) => (
        <ConsoleStatusBadge
          status={v.suspended ? "suspended" : "active"}
          label={v.suspended ? "SUSPENDED" : "ACTIVE"}
        />
      ),
    },
    {
      key: "riskScore",
      header: "Risk Level",
      sortable: true,
      render: (v: ViewerAccount) => {
        const isHigh = v.riskScore > 50;
        const isMedium = v.riskScore > 20 && !isHigh;
        return (
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono border ${
                isHigh
                  ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                  : isMedium
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                    : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              }`}
            >
              {v.riskScore}
            </span>
            <span className="text-[10px] text-slate-400">
              {isHigh ? "High" : isMedium ? "Medium" : "Low"}
            </span>
          </div>
        );
      },
    },
    {
      key: "createdAt",
      header: "Joined",
      render: (v: ViewerAccount) => (
        <span className="text-xs text-slate-400">
          {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right" as const,
      render: (v: ViewerAccount) => (
        <button
          onClick={() => handleInspect(v)}
          className="px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 font-bold text-xs transition"
        >
          Viewer 360
        </button>
      ),
    },
  ];

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Viewer 360 Management"
      tagline="Unified account lookup, risk diagnostics, device management and compliance controls"
      activePath="/zillionaire/viewers"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={() => fetchViewers(searchQuery)}
      isRefreshing={loading}
    >
      {/* Alert Banners */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {error && (
        <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Welcome Banner */}
      <ConsoleWelcomeBanner
        title="Viewer 360 Intelligence"
        description="Search any account instantly by email, user identifier, or name. All administrative actions require signed justification and update the tamper-evident audit ledger."
        badgeText="Identity & Compliance"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Total Registered Viewers"
          value={kpis.total}
          subtitle="Platform viewer directory"
          variant="blue"
          icon={Users}
        />
        <ConsoleKpiCard
          title="Active Accounts"
          value={kpis.active}
          subtitle="Unrestricted access"
          variant="green"
          icon={CheckCircle2}
        />
        <ConsoleKpiCard
          title="Suspended Viewers"
          value={kpis.suspended}
          subtitle="Access blocked by policy"
          variant="purple"
          icon={Lock}
        />
        <ConsoleKpiCard
          title="Elevated Risk Accounts"
          value={kpis.highRisk}
          subtitle="Score above threshold"
          variant="gold"
          icon={ShieldAlert}
        />
      </div>

      {/* Filters and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-800 bg-[#08122c]">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by email, UID, or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-black/40 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400 mr-1">Filter:</span>
          {(["all", "active", "suspended"] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                statusFilter === filter
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                  : "bg-white/5 border border-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Main Viewers Table */}
      <ConsoleCard
        title="Viewer Directory"
        description="Showing all accounts matching current query. Click Viewer 360 on any account for deep diagnostics and administrative actions."
      >
        <ConsoleTable
          columns={columns}
          data={filteredViewers}
          keyField="id"
          searchPlaceholder="Filter listed records..."
          emptyTitle="No viewers match the criteria"
          emptyDescription="Try adjusting your search terms or filter selection."
        />
      </ConsoleCard>

      {/* Viewer 360 Detail Drawer / Modal */}
      {selectedViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-cyan-600/20 border border-cyan-500/40 flex items-center justify-center text-sm font-bold text-cyan-300">
                  {selectedViewer.displayName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{selectedViewer.displayName}</span>
                    <ConsoleStatusBadge
                      status={selectedViewer.suspended ? "suspended" : "active"}
                      label={selectedViewer.suspended ? "SUSPENDED" : "ACTIVE"}
                    />
                  </h3>
                  <p className="text-xs text-slate-400 font-mono">{selectedViewer.email}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedViewer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-3 mb-5">
              <button
                onClick={() => setActiveTab("profile")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === "profile"
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Profile & Metadata
              </button>
              <button
                onClick={() => setActiveTab("risk")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === "risk"
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Risk Engine Telemetry
              </button>
              <button
                onClick={() => setActiveTab("actions")}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeTab === "actions"
                    ? "bg-cyan-500/20 border border-cyan-500/40 text-cyan-300"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Administrative Controls
              </button>
            </div>

            {/* Tab: Profile */}
            {activeTab === "profile" && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3 p-4 rounded-xl border border-slate-800 bg-black/30">
                  <div>
                    <span className="text-slate-400">Account UID:</span>
                    <p className="font-mono text-white text-[11px] select-all mt-0.5">
                      {selectedViewer.id}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-400">Primary Email:</span>
                    <p className="font-medium text-white mt-0.5">{selectedViewer.email}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Display Name:</span>
                    <p className="font-medium text-white mt-0.5">{selectedViewer.displayName}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Registration Date:</span>
                    <p className="font-medium text-white mt-0.5">
                      {selectedViewer.createdAt
                        ? new Date(selectedViewer.createdAt).toLocaleString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-300 mb-2">Assigned Role Tags</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedViewer.roleTags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-slate-300 text-xs font-mono"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Risk */}
            {activeTab === "risk" && (
              <div className="space-y-4 text-xs">
                {riskLoading ? (
                  <div className="p-6 text-center text-slate-400">Loading risk signals...</div>
                ) : riskDetails ? (
                  <>
                    <div className="p-4 rounded-xl border border-slate-800 bg-black/30 flex items-center justify-between">
                      <div>
                        <span className="text-slate-400 text-xs">24-Hour Risk Evaluation</span>
                        <div className="text-2xl font-black text-white mt-1">
                          {riskDetails.score} / 100
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase border ${
                          riskDetails.score > 50
                            ? "bg-rose-500/20 border-rose-500/40 text-rose-300"
                            : riskDetails.score > 20
                              ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                              : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                        }`}
                      >
                        {riskDetails.level} risk
                      </span>
                    </div>

                    <div>
                      <h4 className="text-xs font-bold text-slate-300 mb-2">
                        Detected Risk Signals
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(riskDetails.counts).map(([type, count]) => (
                          <div
                            key={type}
                            className="p-2.5 rounded-lg border border-slate-800 bg-white/5 flex items-center justify-between"
                          >
                            <span className="text-slate-400 capitalize">
                              {type.replace(/_/g, " ")}
                            </span>
                            <span
                              className={`font-mono font-bold ${
                                count > 0 ? "text-amber-400" : "text-slate-500"
                              }`}
                            >
                              {count}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-xl border border-slate-800 bg-white/5 text-slate-400">
                    No risk signals recorded for this user in the current 24-hour window.
                  </div>
                )}
              </div>
            )}

            {/* Tab: Actions */}
            {activeTab === "actions" && (
              <div className="space-y-4 text-xs">
                {actionError && (
                  <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200">
                    {actionError}
                  </div>
                )}

                <div className="p-4 rounded-xl border border-slate-800 bg-black/30 space-y-3">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-cyan-400" />
                    <span>Account Suspension & Status Override</span>
                  </h4>
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    Suspending an account revokes active sessions immediately and prevents future
                    sign-ins across web, TV and mobile devices.
                  </p>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Mandatory Audit Reason *
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Specify terms violation, suspected fraud, or legal request reference..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white placeholder-slate-500 outline-none focus:border-cyan-500 text-xs"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] text-slate-400">
                      Current state:{" "}
                      <strong
                        className={selectedViewer.suspended ? "text-rose-400" : "text-emerald-400"}
                      >
                        {selectedViewer.suspended ? "Suspended" : "Active"}
                      </strong>
                    </span>
                    <button
                      onClick={handleToggleStatus}
                      disabled={actionBusy}
                      className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 transition ${
                        selectedViewer.suspended
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30"
                          : "bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30"
                      } disabled:opacity-50`}
                    >
                      {selectedViewer.suspended ? (
                        <>
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>{actionBusy ? "Processing..." : "Unsuspend Account"}</span>
                        </>
                      ) : (
                        <>
                          <UserX className="h-3.5 w-3.5" />
                          <span>{actionBusy ? "Processing..." : "Suspend Account"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
