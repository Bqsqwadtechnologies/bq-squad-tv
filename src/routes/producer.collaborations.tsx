import { useEffect, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Users,
  Percent,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Shield,
  FileText,
  Lock,
  RefreshCw,
  Send,
  X,
  AlertOctagon,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/producer/collaborations")({
  component: ProducerCollaborationsPage,
  head: () => ({
    meta: [
      { title: "Collaborations & Revenue Splits | Producer Hub" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type SplitEntry = {
  email: string;
  shareBps: number;
  role: string;
  confirmed: boolean;
  confirmedAt: string | null;
  uid?: string;
};

type Collaboration = {
  id: string;
  titleId: string;
  titleName: string;
  leadUid: string;
  leadEmail: string;
  version: number;
  status: "pending_confirmation" | "active" | "disputed" | "revision_required" | "pending_reconfirmation";
  splits: SplitEntry[];
  revisionReason?: string;
  disputeReason?: string;
  createdAt: string;
  updatedAt: string;
};

function ProducerCollaborationsPage() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="producer"
          title="Collaborations & Revenue Splits"
          tagline="Manage co-production split agreements, collaborator requests, and agreed revenue allocations."
          activePath="/producer/collaborations"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <CollaborationsBody token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

function CollaborationsBody({
  token,
  account,
}: {
  token: string;
  account: ConsoleAccount;
}) {
  const [collaborations, setCollaborations] = useState<Collaboration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [disputeCollabId, setDisputeCollabId] = useState<string | null>(null);
  const [disputeReasonInput, setDisputeReasonInput] = useState("");
  const [busy, setBusy] = useState(false);

  // Form state
  const [titleName, setTitleName] = useState("");
  const [titleId, setTitleId] = useState("");
  const [splits, setSplits] = useState<Array<{ email: string; sharePct: number; role: string }>>([
    { email: account.email || "", sharePct: 70, role: "Lead Producer" },
    { email: "", sharePct: 30, role: "Co-Producer / Director" },
  ]);

  const loadCollabs = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/public/v1/producer/collaborations", {
        headers: getWebAuthHeaders(token),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCollaborations(data.collaborations || []);
    } catch (e: any) {
      setError(e.message || "Could not load collaborations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadCollabs();
  }, [token]);

  const currentTotalPct = useMemo(() => {
    return splits.reduce((acc, s) => acc + (Number(s.sharePct) || 0), 0);
  }, [splits]);

  const handleCreateAgreement = async () => {
    if (Math.abs(currentTotalPct - 100) > 0.001) {
      setError(`The split percentages must total exactly 100.00%. Current total: ${currentTotalPct.toFixed(2)}%`);
      return;
    }
    if (!titleName.trim()) {
      setError("Please provide the title name.");
      return;
    }
    try {
      setBusy(true);
      const payload = {
        action: "CREATE_OR_INVITE",
        titleId: titleId.trim() || `title_${Date.now()}`,
        titleName: titleName.trim(),
        splits: splits.map((s) => ({
          email: s.email.trim(),
          shareBps: Math.round(Number(s.sharePct) * 100),
          role: s.role.trim() || "Collaborator",
        })),
      };

      const res = await fetch("/api/public/v1/producer/collaborations", {
        method: "POST",
        headers: {
          ...getWebAuthHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || err.error || `HTTP ${res.status}`);
      }

      setShowCreateModal(false);
      setTitleName("");
      setTitleId("");
      await loadCollabs();
    } catch (e: any) {
      setError(e.message || "Failed to create collaboration agreement.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async (collab: Collaboration) => {
    try {
      setBusy(true);
      const res = await fetch("/api/public/v1/producer/collaborations", {
        method: "POST",
        headers: {
          ...getWebAuthHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "CONFIRM_AGREEMENT",
          collaborationId: collab.id,
          version: collab.version,
        }),
      });
      if (!res.ok) throw new Error("Could not confirm agreement.");
      await loadCollabs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDispute = (collabId: string) => {
    setDisputeCollabId(collabId);
    setDisputeReasonInput("");
  };

  const confirmDispute = async () => {
    if (!disputeCollabId || !disputeReasonInput.trim()) return;
    try {
      setBusy(true);
      const res = await fetch("/api/public/v1/producer/collaborations", {
        method: "POST",
        headers: {
          ...getWebAuthHeaders(token),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "DISPUTE",
          collaborationId: disputeCollabId,
          reason: disputeReasonInput.trim(),
        }),
      });
      if (!res.ok) throw new Error("Could not submit dispute.");
      setDisputeCollabId(null);
      await loadCollabs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Deletion Policy Banner */}
      <div className="rounded-xl border border-sky-800/60 bg-sky-950/40 p-4 text-sky-200">
        <div className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5 text-sky-400" />
          <span>Platform Content Governance Notice</span>
        </div>
        <p className="mt-1 text-xs text-sky-300">
          Producers cannot delete videos from the platform catalogue once ingested. Deletions and restorations are executed solely by the platform owner to protect viewer rights, contracts, and revenue audit trails.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Title Collaborations & Splits</h2>
          <p className="text-sm text-slate-400">
            Split agreements must sum to exactly 100%. All parties must confirm before automated payouts begin.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void loadCollabs()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" /> New Split Agreement
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-slate-400">Loading collaborations...</div>
      ) : collaborations.length === 0 ? (
        <ConsoleCard title="Collaborations">
          <div className="p-8 text-center text-slate-400">
            <Users className="mx-auto mb-2 h-8 w-8 text-slate-500" />
            <p className="font-semibold text-slate-300">No collaboration agreements yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Add collaborators or create an agreed revenue split for shared productions.
            </p>
          </div>
        </ConsoleCard>
      ) : (
        <div className="grid gap-4">
          {collaborations.map((collab) => {
            const mySplit = collab.splits.find(
              (s) => s.email.toLowerCase() === (account.email || "").toLowerCase(),
            );
            return (
              <ConsoleCard key={collab.id} title={collab.titleName}>
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div>
                      <span className="text-xs text-slate-400">Agreement v{collab.version} · Created by {collab.leadEmail}</span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        collab.status === "active"
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : collab.status === "disputed"
                          ? "bg-red-950 text-red-300 border border-red-800"
                          : "bg-amber-950 text-amber-300 border border-amber-800"
                      }`}
                    >
                      {collab.status.replace("_", " ").toUpperCase()}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                    {collab.splits.map((s, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-slate-800 bg-slate-900/60 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{(s.shareBps / 100).toFixed(2)}%</span>
                          {s.confirmed ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Confirmed
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-400">
                              <Clock className="h-3.5 w-3.5" /> Pending
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-300">{s.email}</p>
                        <p className="text-[11px] text-slate-500">{s.role}</p>
                      </div>
                    ))}
                  </div>

                  {collab.disputeReason && (
                    <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-xs text-red-200">
                      <div className="flex items-center gap-1 font-semibold text-red-300">
                        <AlertOctagon className="h-3.5 w-3.5" /> Dispute Filed
                      </div>
                      <p className="mt-1">{collab.disputeReason}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800 pt-3">
                    {mySplit && !mySplit.confirmed && (
                      <button
                        onClick={() => void handleConfirm(collab)}
                        disabled={busy}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                      >
                        Confirm My Share ({(mySplit.shareBps / 100).toFixed(2)}%)
                      </button>
                    )}
                    {collab.status !== "disputed" && (
                      <button
                        onClick={() => void handleDispute(collab.id)}
                        disabled={busy}
                        className="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950"
                      >
                        Dispute Split
                      </button>
                    )}
                  </div>
                </div>
              </ConsoleCard>
            );
          })}
        </div>
      )}

      {/* Modal: Dispute Collaboration Agreement */}
      {disputeCollabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a1435] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-sm">Dispute Collaboration Agreement</h3>
              <button onClick={() => setDisputeCollabId(null)} className="text-blue-200/60 hover:text-white">✕</button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-blue-100/70">
                State the reason or factual inaccuracy in this revenue share agreement:
              </p>
              <textarea
                value={disputeReasonInput}
                onChange={(e) => setDisputeReasonInput(e.target.value)}
                placeholder="e.g. Unauthorised credit listing or incorrect percentage share..."
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-white placeholder-blue-200/40 focus:border-cyan-400 focus:outline-none"
              />
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDisputeCollabId(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-blue-200/70 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDispute}
                  disabled={busy || !disputeReasonInput.trim()}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {busy ? "Submitting..." : "Submit Formal Dispute"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: New Split Agreement */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Create Co-Production Split</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300">Title / Film Name</label>
                <input
                  type="text"
                  value={titleName}
                  onChange={(e) => setTitleName(e.target.value)}
                  placeholder="e.g. Lagos Nights Documentary"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm text-white"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span>Collaborators & Percentage Splits</span>
                  <span className={Math.abs(currentTotalPct - 100) < 0.001 ? "text-emerald-400" : "text-amber-400"}>
                    Total: {currentTotalPct.toFixed(2)}% / 100.00%
                  </span>
                </div>

                {splits.map((s, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="email"
                      value={s.email}
                      onChange={(e) => {
                        const updated = [...splits];
                        updated[idx].email = e.target.value;
                        setSplits(updated);
                      }}
                      placeholder="Collaborator Email"
                      className="w-1/2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max="100"
                      value={s.sharePct}
                      onChange={(e) => {
                        const updated = [...splits];
                        updated[idx].sharePct = parseFloat(e.target.value) || 0;
                        setSplits(updated);
                      }}
                      className="w-1/4 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                      placeholder="Share %"
                    />
                    <input
                      type="text"
                      value={s.role}
                      onChange={(e) => {
                        const updated = [...splits];
                        updated[idx].role = e.target.value;
                        setSplits(updated);
                      }}
                      placeholder="Role"
                      className="w-1/4 rounded-lg border border-slate-700 bg-slate-900 p-2 text-xs text-white"
                    />
                  </div>
                ))}

                <button
                  onClick={() =>
                    setSplits([...splits, { email: "", sharePct: 0, role: "Collaborator" }])
                  }
                  className="text-xs text-sky-400 hover:underline"
                >
                  + Add another collaborator
                </button>
              </div>

              <div className="border-t border-slate-800 pt-4 flex justify-end gap-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleCreateAgreement()}
                  disabled={busy || Math.abs(currentTotalPct - 100) > 0.001}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Saving..." : "Create & Send Requests"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
