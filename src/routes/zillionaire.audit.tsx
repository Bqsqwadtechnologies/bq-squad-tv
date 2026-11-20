import { useEffect, useMemo, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  FileCheck,
  Search,
  Download,
  RefreshCw,
  ShieldAlert,
  User,
  Clock,
} from "lucide-react";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleTable,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/audit")({
  component: ZillionaireAuditRoute,
  head: () => ({
    meta: [
      { title: "Audit Log | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type AuditEntry = {
  id: string;
  actorUid: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function ZillionaireAuditRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="roles">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Audit Log & Governance"
          tagline="Immutable ledger of operator actions, policy modifications, and security events"
          activePath="/zillionaire/audit"
          account={{
            ...(account.email ? { email: account.email } : {}),
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          {...(onLock ? { onLock } : {})}
        >
          <AuditDashboard token={token} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

function AuditDashboard({ token }: { token: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [actionCategory, setActionCategory] = useState("all");
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null);

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/audit?limit=150", {
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setEntries(json.entries || []);
    } catch (e) {
      console.error("Failed to load audit logs", e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchAuditLogs();
  }, [fetchAuditLogs]);

  const filteredEntries = useMemo(() => {
    return entries.filter((item) => {
      if (actionCategory !== "all") {
        if (!item.action.startsWith(actionCategory)) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.action.toLowerCase().includes(q) ||
          item.reason.toLowerCase().includes(q) ||
          (item.actorUid && item.actorUid.toLowerCase().includes(q)) ||
          (item.targetId && item.targetId.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [entries, actionCategory, searchQuery]);

  const exportCsv = () => {
    if (!filteredEntries.length) return;
    const headers = ["Timestamp", "Action", "Actor UID", "Target Type", "Target ID", "Reason"];
    const rows = filteredEntries.map((e) => [
      e.createdAt,
      `"${e.action}"`,
      `"${e.actorUid || ""}"`,
      `"${e.targetType || ""}"`,
      `"${e.targetId || ""}"`,
      `"${e.reason.replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bq-audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Tamper-Evident Audit Log"
        description="Immutable ledger of operator actions, policy modifications, financial approvals, and security events."
        badgeText="Governance & Audit"
        actionLabel="Export CSV"
        onAction={exportCsv}
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ConsoleKpiCard
          title="Total Logged Actions"
          value={entries.length}
          subtitle="Last 30 days"
          icon={FileCheck}
          variant="blue"
        />
        <ConsoleKpiCard
          title="Security & Auth Events"
          value={entries.filter((e) => e.action.includes("security") || e.action.includes("access")).length}
          subtitle="Real-time telemetry"
          icon={ShieldAlert}
          variant="purple"
        />
        <ConsoleKpiCard
          title="Financial Actions"
          value={entries.filter((e) => e.action.includes("payout") || e.action.includes("payment")).length}
          subtitle="Audited transfers"
          icon={Clock}
          variant="green"
        />
        <ConsoleKpiCard
          title="Active Actors"
          value={new Set(entries.map((e) => e.actorUid).filter(Boolean)).size}
          subtitle="Authorized accounts"
          icon={User}
          variant="gold"
        />
      </div>

      {/* Search and Filters */}
      <ConsoleCard
        title="System Audit Entries"
        subtitle="Search by actor UID, action name, target reference or justification reason"
        headerAction={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10 transition"
            >
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              Download Log
            </button>
            <button
              type="button"
              onClick={() => void fetchAuditLogs()}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 hover:bg-white/10 transition"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        }
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-400 font-semibold mr-1">Category:</span>
            {[
              { id: "all", label: "All Actions" },
              { id: "notification", label: "Notifications" },
              { id: "channel", label: "Channels" },
              { id: "payout", label: "Payouts" },
              { id: "security", label: "Security" },
              { id: "error", label: "Errors" },
              { id: "support", label: "Support" },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActionCategory(cat.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  actionCategory === cat.id
                    ? "bg-cyan-500 text-slate-950"
                    : "bg-white/5 text-slate-400 hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search audit records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-xl border border-white/15 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white outline-none focus:border-cyan-400 w-64"
            />
          </div>
        </div>

        <ConsoleTable
          columns={[
            { key: "action", label: "Action" },
            { key: "actor", label: "Actor UID" },
            { key: "target", label: "Target" },
            { key: "when", label: "Timestamp" },
            { key: "reason", label: "Reason (click row to inspect)" },
          ]}
          data={filteredEntries.map((e) => ({
            id: e.id,
            action: e.action,
            actor: e.actorUid ? e.actorUid.slice(0, 16) : "system",
            target: [e.targetType, e.targetId].filter(Boolean).join(" · ") || "—",
            when: new Date(e.createdAt).toLocaleString(),
            reason: e.reason.slice(0, 80),
          }))}
          loading={loading}
          onRowClick={(row) => {
            const found = filteredEntries.find((e) => e.id === row["id"]);
            if (found) setSelectedEntry(found);
          }}
        />
      </ConsoleCard>

      {/* Metadata Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-white/20 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Audit Entry Details</h3>
                <span className="font-mono text-xs text-cyan-400">{selectedEntry.action}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 font-semibold block mb-0.5">Mandatory Reason:</span>
                <p className="rounded-xl border border-white/10 bg-slate-950 p-2.5 text-slate-200">
                  {selectedEntry.reason}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] block">Actor UID:</span>
                  <span className="text-slate-200">{selectedEntry.actorUid || "system"}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block">Target ID:</span>
                  <span className="text-slate-200">{selectedEntry.targetId || "—"}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-semibold block mb-1">Safe Metadata:</span>
                <pre className="max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[11px] text-cyan-300">
                  {JSON.stringify(selectedEntry.metadata, null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
