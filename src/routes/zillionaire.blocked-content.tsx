import { useState, useEffect, useMemo } from "react";
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
  Ban,
  Search,
  RotateCcw,
  ShieldAlert,
  Clock,
  Eye,
  FileText,
  User,
  X,
  AlertTriangle,
  Film,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/blocked-content")({
  component: ZillionaireBlockedContentRoute,
  head: () => ({
    meta: [
      { title: "Blocked Content Log | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface BlockedItem {
  assetId: string;
  title: string;
  posterUrl: string | null;
  channelId: string;
  category: string;
  status: string;
  contentStatus: string;
  blockedAt: string | null;
  blockedBy: string;
  blockedReason: string;
  takedownNotice: {
    claimant?: string;
    complaintRef?: string;
    reason?: string;
    filedAt?: string;
  } | null;
  viewsCount: number;
  totalWatchMinutes: number;
}

function ZillionaireBlockedContentRoute() {
  return (
    <ConsolePageGuard
      role="admin"
      module="moderation"
      title="Blocked Content Log"
      description="Dedicated immutable enforcement log of all blocked and takedown assets with one-click owner restore."
    >
      {(token, account, onLock) => (
        <ZillionaireBlockedContentPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireBlockedContentPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [items, setItems] = useState<BlockedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"ALL" | "TAKEDOWN" | "POLICY">("ALL");

  // Modal for Takedown Details inspection
  const [selectedNotice, setSelectedNotice] = useState<BlockedItem | null>(null);

  // Unblock in progress state
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const fetchBlocked = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const params = new URLSearchParams();
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/public/v1/zillionaire/blocked-content/?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocked();
  }, [searchQuery]);

  const handleOneClickUnblock = async (item: BlockedItem) => {
    const defaultReason = `Owner override unblock for "${item.title}" (${item.assetId})`;
    const confirmed = confirm(`Are you sure you want to ONE-CLICK UNBLOCK:\n"${item.title}"?\n\nThis will immediately restore streaming eligibility.`);
    if (!confirmed) return;

    setUnblockingId(item.assetId);
    setActionFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/blocked-content/${item.assetId}/unblock`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: defaultReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback(`"${item.title}" successfully unblocked and returned to catalogue.`);
        await fetchBlocked();
      } else {
        setActionFeedback(`Unblock failed: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionFeedback(err instanceof Error ? err.message : "Error unblocking title.");
    } finally {
      setUnblockingId(null);
    }
  };

  const filteredItems = useMemo(() => {
    if (filterType === "TAKEDOWN") {
      return items.filter((x) => x.status === "TAKEDOWN" || x.takedownNotice);
    }
    if (filterType === "POLICY") {
      return items.filter((x) => x.status !== "TAKEDOWN" && !x.takedownNotice);
    }
    return items;
  }, [items, filterType]);

  const stats = useMemo(() => {
    const total = items.length;
    const takedowns = items.filter((x) => x.status === "TAKEDOWN" || x.takedownNotice).length;
    const policy = total - takedowns;
    return { total, takedowns, policy };
  }, [items]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Blocked Content Log"
      subtitle="Dedicated log of all blocked videos, episodes and takedown notices with instant owner unblock"
      account={account}
      onLock={onLock}
      activePath="/zillionaire/blocked-content"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Blocked Content & Enforcement Registry"
          subtitle="Every blocked asset halts delivery instantly. Takedown notices and copyright complaint files are preserved in the permanent compliance audit log."
        />

        {/* Feedback alert */}
        {actionFeedback && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded-lg text-cyan-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>{actionFeedback}</span>
            </div>
            <button onClick={() => setActionFeedback(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ConsoleKpiCard
            title="Total Blocked Assets"
            value={stats.total.toLocaleString()}
            change="Revoked catalogue items"
            icon={<Ban className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Copyright & DMCA Notices"
            value={stats.takedowns.toLocaleString()}
            change="Formal complaint filings"
            icon={<ShieldAlert className="w-5 h-5" />}
            color="gold"
          />
          <ConsoleKpiCard
            title="Platform Policy Blocks"
            value={stats.policy.toLocaleString()}
            change="Internal moderation"
            icon={<AlertTriangle className="w-5 h-5" />}
            color="blue"
          />
        </div>

        {/* Filter and Search Bar */}
        <ConsoleCard title="Search & Enforcement Type">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by title, ID, channel, claimant, complaint ref..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setFilterType("ALL")}
                className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                  filterType === "ALL" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                All Enforcements ({stats.total})
              </button>
              <button
                onClick={() => setFilterType("TAKEDOWN")}
                className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                  filterType === "TAKEDOWN" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                DMCA & Copyright ({stats.takedowns})
              </button>
              <button
                onClick={() => setFilterType("POLICY")}
                className={`px-3 py-2 rounded-lg text-xs font-semibold ${
                  filterType === "POLICY" ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Policy Violations ({stats.policy})
              </button>
            </div>
          </div>
        </ConsoleCard>

        {/* Blocked Items Table */}
        <ConsoleCard title={`Enforcement Log Records (${filteredItems.length})`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading blocked content log...</div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No blocked content records found.</div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "title", label: "Asset & Artwork" },
                { key: "channel", label: "Channel" },
                { key: "type", label: "Enforcement Type" },
                { key: "reason", label: "Why / Legal Notice" },
                { key: "actor", label: "Blocked By & Time" },
                { key: "actions", label: "One-Click Restore" },
              ]}
              data={filteredItems.map((item) => ({
                id: item.assetId,
                title: (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-16 bg-slate-950 rounded border border-slate-800 overflow-hidden flex-shrink-0 flex items-center justify-center text-slate-600">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Film className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs">{item.title}</div>
                      <div className="text-slate-500 text-[10px] font-mono">{item.assetId}</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        {item.viewsCount.toLocaleString()} views • {item.totalWatchMinutes.toLocaleString()} min watched
                      </div>
                    </div>
                  </div>
                ),
                channel: (
                  <span className="text-xs font-mono text-cyan-400 font-semibold">{item.channelId}</span>
                ),
                type: (
                  <ConsoleStatusBadge
                    status="error"
                    label={item.takedownNotice ? "COPYRIGHT TAKEDOWN" : "POLICY BLOCKED"}
                  />
                ),
                reason: (
                  <div className="text-xs max-w-xs space-y-1">
                    <p className="text-slate-200 line-clamp-2">{item.blockedReason}</p>
                    {item.takedownNotice && (
                      <button
                        onClick={() => setSelectedNotice(item)}
                        className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                      >
                        <FileText className="w-3 h-3" />
                        <span>View DMCA Notice ({item.takedownNotice.complaintRef})</span>
                      </button>
                    )}
                  </div>
                ),
                actor: (
                  <div className="text-xs space-y-0.5">
                    <div className="text-slate-300 flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="font-mono text-[11px]">{item.blockedBy}</span>
                    </div>
                    <div className="text-slate-500 text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{item.blockedAt ? new Date(item.blockedAt).toLocaleString() : "Unknown"}</span>
                    </div>
                  </div>
                ),
                actions: (
                  <button
                    disabled={unblockingId === item.assetId}
                    onClick={() => handleOneClickUnblock(item)}
                    className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{unblockingId === item.assetId ? "Unblocking..." : "One-Click Unblock"}</span>
                  </button>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Modal: Takedown Legal Notice Details */}
        {selectedNotice && selectedNotice.takedownNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">DMCA & Copyright Takedown Record</h3>
                </div>
                <button onClick={() => setSelectedNotice(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 bg-slate-950 p-4 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Target Title</span>
                  <span className="text-white font-semibold text-sm">{selectedNotice.title}</span>
                  <span className="text-slate-500 font-mono block text-[11px]">{selectedNotice.assetId}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Claimant / Rights Holder</span>
                    <span className="text-amber-300 font-semibold">{selectedNotice.takedownNotice.claimant || "Anonymous"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Complaint Reference</span>
                    <span className="text-cyan-300 font-mono">{selectedNotice.takedownNotice.complaintRef || "N/A"}</span>
                  </div>
                </div>
                <div className="pt-2">
                  <span className="text-slate-500 block text-[10px] uppercase font-bold">Formal Legal Reason & Notice Text</span>
                  <p className="text-slate-300 mt-1 whitespace-pre-wrap">{selectedNotice.takedownNotice.reason || selectedNotice.blockedReason}</p>
                </div>
                <div className="pt-2 text-slate-500 text-[10px]">
                  Filing Timestamp: {selectedNotice.takedownNotice.filedAt ? new Date(selectedNotice.takedownNotice.filedAt).toLocaleString() : "N/A"}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedNotice(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const itm = selectedNotice;
                    setSelectedNotice(null);
                    handleOneClickUnblock(itm);
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-bold flex items-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Unblock This Asset</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
