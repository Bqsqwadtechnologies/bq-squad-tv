import React, { useState, useEffect } from "react";

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
  statusState: "new" | "investigating" | "resolved";
};

export function ErrorCenterView({ sessionToken }: { sessionToken?: string } = {}) {
  const [items, setItems] = useState<ErrorEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchRef, setSearchRef] = useState("");
  const [selected, setSelected] = useState<ErrorEventItem | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchErrors();
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
        setItems(data.items || []);
        if (data.items?.length > 0 && !selected) {
          setSelected(data.items[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load error events", err);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    fetchErrors(searchRef.trim());
  }

  function copyDiagnostic(item: ErrorEventItem) {
    const diagnostic = `### BQ SQWAD TV Error Diagnostic
- **Fingerprint**: \`${item.fingerprint}\`
- **Code**: \`${item.code}\` (HTTP ${item.status})
- **Route**: \`${item.routePattern}\`
- **Category**: \`${item.causeCategory}\`
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
        return "Verify Paystack/Stripe webhook secret configuration and balance ledger integrity.";
      case "storage":
        return "Check Cloudflare R2 bucket credentials, upload policy, and signed URL expiration.";
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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 text-zinc-100">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Error Centre</h1>
          <p className="text-sm text-zinc-400">
            Privacy-safe error tracking and diagnostic telemetry for BQ SQWAD TV.
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search by Reference (e.g. BQ-7F3K9)"
            value={searchRef}
            onChange={(e) => setSearchRef(e.target.value)}
            className="px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
          />
          <button
            type="submit"
            className="px-4 py-1.5 text-sm font-semibold bg-red-600 hover:bg-red-500 text-white rounded-lg transition"
          >
            Search
          </button>
          {searchRef && (
            <button
              type="button"
              onClick={() => {
                setSearchRef("");
                fetchErrors();
              }}
              className="text-xs text-zinc-400 hover:text-white underline ml-2"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div className="p-12 text-center text-zinc-500">Loading error events...</div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-xl bg-zinc-900/50 border border-zinc-800 text-zinc-400">
          No error events recorded matching your query.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Fingerprint List */}
          <div className="lg:col-span-1 space-y-3 max-h-[700px] overflow-y-auto pr-2">
            {items.map((item) => (
              <button
                key={item.fingerprint}
                onClick={() => setSelected(item)}
                className={`w-full text-left p-4 rounded-xl border transition ${
                  selected?.fingerprint === item.fingerprint
                    ? "bg-zinc-800/90 border-red-500/80 shadow-lg"
                    : "bg-zinc-900/60 border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono text-zinc-400 mb-1">
                  <span>{item.code}</span>
                  <span className="px-2 py-0.5 rounded bg-red-950/80 text-red-400 font-semibold border border-red-800/40">
                    {item.count} {item.count === 1 ? "hit" : "hits"}
                  </span>
                </div>
                <div className="text-sm font-semibold text-zinc-200 truncate">
                  {item.routePattern}
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 mt-2">
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
            <div className="lg:col-span-2 p-6 rounded-xl bg-zinc-900 border border-zinc-800 space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{selected.code}</span>
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-zinc-800 text-zinc-300">
                      HTTP {selected.status}
                    </span>
                    <span className="px-2.5 py-0.5 text-xs font-semibold rounded bg-red-950 text-red-300 border border-red-800/50 uppercase">
                      {selected.causeCategory}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 font-mono mt-1">
                    Fingerprint: {selected.fingerprint}
                  </p>
                </div>
                <button
                  onClick={() => copyDiagnostic(selected)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                >
                  {copied ? "Copied!" : "Copy Diagnostic"}
                </button>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  Route Pattern
                </h3>
                <p className="font-mono text-sm text-zinc-300 mt-1 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                  {selected.routePattern}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  Redacted Technical Message
                </h3>
                <p className="text-sm text-zinc-300 mt-1 bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono">
                  {selected.redactedTechnicalMessage}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  Likely Cause & Recommended Fix
                </h3>
                <p className="text-sm text-emerald-400 mt-1 bg-emerald-950/20 p-3 rounded-lg border border-emerald-900/30">
                  {getFixSuggestion(selected.causeCategory, selected.code)}
                </p>
              </div>

              <div>
                <h3 className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                  Recent Reference IDs ({selected.recentRefs.length})
                </h3>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selected.recentRefs.map((r) => (
                    <span
                      key={r}
                      className="px-2.5 py-1 text-xs font-mono rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
                    >
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {selected.topStackFrames.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-zinc-500 tracking-wider">
                    Safe Top Stack Frames
                  </h3>
                  <pre className="text-xs font-mono text-zinc-400 mt-1 bg-zinc-950 p-3 rounded-lg border border-zinc-800 overflow-x-auto">
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
