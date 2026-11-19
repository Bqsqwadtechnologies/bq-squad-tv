import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertTriangle, Clock, RefreshCw, Copy, Check, Filter } from "lucide-react";

export type ErrorEventItem = {
  fingerprint: string;
  code: string;
  routePattern: string;
  status: number;
  causeCategory: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  recentRefs: string[];
  platformClass: string;
  appVersion?: string;
  affectedUserCount: number;
  redactedTechnicalMessage: string;
  topStackFrames: string[];
  statusState?: "new" | "investigating" | "resolved";
  resolutionNotes?: string;
};

export function ErrorCenterView({ sessionToken, isOwner = true }: { sessionToken?: string; isOwner?: boolean } = {}) {
  const [items, setItems] = useState<ErrorEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchRef, setSearchRef] = useState("");
  const [selected, setSelected] = useState<ErrorEventItem | null>(null);
  const [copied, setCopied] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    void fetchErrors();
  }, []);

  async function fetchErrors(ref?: string) {
    setLoading(true);
    try {
      const url = ref
        ? `/api/public/v1/zillionaire/errors?ref=${encodeURIComponent(ref)}`
        : `/api/public/v1/zillionaire/errors`;
      const res = await fetch(url, {
        headers: {
          authorization: `Bearer ${sessionToken || localStorage.getItem("token") || ""}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const loadedItems: ErrorEventItem[] = (data.items || []).map((it: Partial<ErrorEventItem>) => ({
          fingerprint: String(it.fingerprint || ""),
          code: String(it.code || "UNKNOWN"),
          routePattern: String(it.routePattern || "/api/unknown"),
          status: typeof it.status === "number" ? it.status : 500,
          causeCategory: String(it.causeCategory || "runtime"),
          count: typeof it.count === "number" ? it.count : 1,
          firstSeen: String(it.firstSeen || new Date().toISOString()),
          lastSeen: String(it.lastSeen || new Date().toISOString()),
          recentRefs: Array.isArray(it.recentRefs) ? it.recentRefs.map(String) : [],
          platformClass: String(it.platformClass || "web"),
          appVersion: it.appVersion ? String(it.appVersion) : undefined,
          affectedUserCount: typeof it.affectedUserCount === "number" ? it.affectedUserCount : 1,
          redactedTechnicalMessage: String(it.redactedTechnicalMessage || "An error occurred."),
          topStackFrames: Array.isArray(it.topStackFrames) ? it.topStackFrames.map(String) : [],
          statusState: (it.statusState as "new" | "investigating" | "resolved") || "new",
          resolutionNotes: it.resolutionNotes ? String(it.resolutionNotes) : undefined,
        }));

        setItems(loadedItems);
        if (loadedItems.length > 0 && !selected) {
          setSelected(loadedItems[0] ?? null);
        }
      }
    } catch (err) {
      console.error("Failed to load error events", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(fingerprint: string, newStatus: "new" | "investigating" | "resolved") {
    setUpdatingStatus(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/errors", {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${sessionToken || localStorage.getItem("token") || ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fingerprint,
          statusState: newStatus,
          resolutionNotes: newStatus === "resolved" ? "Resolved by owner in Error Centre" : undefined,
        }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.fingerprint === fingerprint ? { ...it, statusState: newStatus } : it))
        );
        if (selected && selected.fingerprint === fingerprint) {
          setSelected((prev) => (prev ? { ...prev, statusState: newStatus } : null));
        }
      }
    } catch (e) {
      console.error("Failed to update status", e);
    } finally {
      setUpdatingStatus(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    void fetchErrors(searchRef.trim());
  }

  function copyDiagnostic(item: ErrorEventItem) {
    const diagnostic = `### BQ SQWAD TV Error Diagnostic
- **Fingerprint**: \`${item.fingerprint}\`
- **Code**: \`${item.code}\` (HTTP ${item.status})
- **Route**: \`${item.routePattern}\`
- **Category**: \`${item.causeCategory}\`
- **Status**: \`${item.statusState || "new"}\`
- **Occurrences**: ${item.count} (Affected users: ~${item.affectedUserCount})
- **First Seen**: ${item.firstSeen}
- **Last Seen**: ${item.lastSeen}
- **Recent Refs**: ${item.recentRefs.join(", ")}
- **Message**: ${item.redactedTechnicalMessage}
- **Stack Trace**:
\`\`\`
${item.topStackFrames.join("\n") || "No stack frames captured"}
\`\`\`
`;
    navigator.clipboard.writeText(diagnostic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function getFixSuggestion(category: string, code: string): string {
    switch (category) {
      case "payment_provider":
        return "Verify Paystack webhook secret configuration and balance ledger integrity.";
      case "storage":
        return "Check Backblaze B2/Cloudflare storage credentials, upload policy, and signed URL expiration.";
      case "database":
        return "Check Firestore quota limits, composite indexes, and transaction conflict retries.";
      case "video_processing":
        return "Inspect live HLS manifest endpoint, worker transcode queue, and segment signing keys.";
      case "validation":
        return "Inspect request payload schema against client API contract version.";
      case "network":
        return "Verify upstream service availability and DNS resolution.";
      default:
        return "Review server logs around the timestamp and check recent code deployments.";
    }
  }

  const filteredItems = items.filter((item) => {
    if (statusFilter !== "all" && item.statusState !== statusFilter) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6 text-zinc-100">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Error Centre</h1>
          <p className="text-sm text-slate-400">
            Privacy-safe error telemetry, fingerprint tracking, and resolution management for BQ SQWAD TV.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form onSubmit={handleSearch} className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Search by Ref (e.g. BQ-7F3K9)"
              value={searchRef}
              onChange={(e) => setSearchRef(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-900 border border-white/15 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              className="px-3 py-1.5 text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl transition"
            >
              Search
            </button>
            {searchRef && (
              <button
                type="button"
                onClick={() => {
                  setSearchRef("");
                  void fetchErrors();
                }}
                className="text-xs text-slate-400 hover:text-white underline ml-1"
              >
                Clear
              </button>
            )}
          </form>
          <button
            type="button"
            onClick={() => void fetchErrors()}
            className="p-2 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-xs text-slate-400 mr-1 font-semibold">Filter:</span>
        {["all", "new", "investigating", "resolved"].map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-lg px-3 py-1 text-xs font-bold capitalize transition ${
              statusFilter === st
                ? "bg-cyan-500 text-slate-950"
                : "bg-white/5 text-slate-400 hover:text-white"
            }`}
          >
            {st}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500">Loading error telemetry...</div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/50 border border-white/10 text-slate-400">
          No error events recorded matching your query.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fingerprint List */}
          <div className="lg:col-span-1 space-y-3 max-h-[700px] overflow-y-auto pr-2">
            {filteredItems.map((item) => (
              <button
                key={item.fingerprint}
                type="button"
                onClick={() => setSelected(item)}
                className={`w-full text-left p-4 rounded-2xl border transition ${
                  selected?.fingerprint === item.fingerprint
                    ? "bg-slate-800/90 border-cyan-400/80 shadow-lg"
                    : "bg-slate-900/60 border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                  <span>{item.code}</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.statusState === "resolved"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : item.statusState === "investigating"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {item.statusState || "new"}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold border border-white/10">
                      {item.count} {item.count === 1 ? "hit" : "hits"}
                    </span>
                  </div>
                </div>
                <div className="text-xs font-bold text-slate-200 truncate">{item.routePattern}</div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                  <span className="capitalize">{item.causeCategory}</span>
                  <span>
                    {new Date(item.lastSeen).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </button>
            ))}
          </div>

          {/* Selected Event Details */}
          {selected && (
            <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-white/10 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-black text-white">{selected.code}</span>
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-slate-800 text-slate-300">
                      HTTP {selected.status}
                    </span>
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 uppercase">
                      {selected.causeCategory}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 text-xs font-bold rounded uppercase ${
                        selected.statusState === "resolved"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : selected.statusState === "investigating"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      }`}
                    >
                      {selected.statusState || "new"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-1">
                    Fingerprint: {selected.fingerprint}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Mark Status Buttons (Owner Only) */}
                  {isOwner && (
                    <div className="flex items-center gap-1.5">
                      {selected.statusState !== "resolved" ? (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleUpdateStatus(selected.fingerprint, "resolved")}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Mark Resolved
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={updatingStatus}
                          onClick={() => handleUpdateStatus(selected.fingerprint, "new")}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => copyDiagnostic(selected)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 transition"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy Diagnostic"}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Route Pattern
                </h3>
                <p className="font-mono text-sm text-cyan-300 mt-1 bg-slate-950 p-2.5 rounded-xl border border-white/10">
                  {selected.routePattern}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Redacted Technical Message
                </h3>
                <p className="text-sm text-slate-300 mt-1 bg-slate-950 p-3 rounded-xl border border-white/10 font-mono">
                  {selected.redactedTechnicalMessage}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-emerald-400 tracking-wider">
                  Likely Cause & Recommended Fix
                </h3>
                <p className="text-sm text-emerald-300 mt-1 bg-emerald-950/30 p-3 rounded-xl border border-emerald-500/30">
                  {getFixSuggestion(selected.causeCategory, selected.code)}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                  Recent Reference IDs ({selected.recentRefs.length})
                </h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selected.recentRefs.map((r) => (
                    <span
                      key={r}
                      className="px-2.5 py-1 text-xs font-mono rounded-lg bg-slate-800 text-slate-300 border border-white/10"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {selected.topStackFrames.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                    Safe Top Stack Frames
                  </h3>
                  <pre className="text-xs font-mono text-slate-400 mt-1 bg-slate-950 p-3 rounded-xl border border-white/10 overflow-x-auto">
                    {selected.topStackFrames.join("\n")}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
