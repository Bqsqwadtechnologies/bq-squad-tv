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
  Film,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  FileCheck,
  X,
  ExternalLink,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/producers")({
  component: ZillionaireProducersRoute,
  head: () => ({
    meta: [
      { title: "Producers | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ProducerItem {
  id: string;
  displayName: string;
  companyName: string;
  planStatus: string;
  verificationStatus: string;
  verificationEvidenceUrl: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
}

function ZillionaireProducersRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="producers">
      {({ token, account, onLock }) => (
        <ZillionaireProducersContent token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireProducersContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [producers, setProducers] = useState<ProducerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Review modal
  const [selectedProducer, setSelectedProducer] = useState<ProducerItem | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "request_evidence">(
    "approve",
  );
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const fetchProducers = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/producers", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load producers");
      setProducers(data.producers || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading producers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchProducers();
  }, [token]);

  const handleOpenReview = (p: ProducerItem) => {
    setSelectedProducer(p);
    setReviewAction(p.verificationStatus === "APPROVED" ? "request_evidence" : "approve");
    setReviewReason("");
    setReviewError("");
  };

  const handleSubmitReview = async () => {
    if (!selectedProducer) return;
    if (!reviewReason.trim()) {
      setReviewError("Please provide an audit justification reason.");
      return;
    }

    setReviewBusy(true);
    setReviewError("");
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch(
        `/api/public/v1/zillionaire/producers/${selectedProducer.id}/verification`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action: reviewAction,
            reason: reviewReason.trim(),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit verification review");

      setSuccessMessage(
        `Producer ${selectedProducer.displayName} verification action '${reviewAction}' recorded.`,
      );
      setSelectedProducer(null);
      void fetchProducers();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setReviewError(err instanceof Error ? err.message : "Error submitting review");
    } finally {
      setReviewBusy(false);
    }
  };

  const kpis = useMemo(() => {
    const total = producers.length;
    const verified = producers.filter((p) => p.verificationStatus === "APPROVED").length;
    const pending = producers.filter((p) => p.verificationStatus === "PENDING").length;
    const activePlan = producers.filter((p) => p.planStatus === "ACTIVE").length;
    return { total, verified, pending, activePlan };
  }, [producers]);

  const columns = [
    {
      key: "displayName",
      header: "Producer Entity",
      sortable: true,
      render: (p: ProducerItem) => (
        <div className="flex flex-col">
          <span className="font-bold text-white text-xs">{p.displayName}</span>
          <span className="text-[11px] text-slate-400">
            {p.companyName ? p.companyName : "Independent Producer"}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">{p.id}</span>
        </div>
      ),
    },
    {
      key: "planStatus",
      header: "Plan Status",
      render: (p: ProducerItem) => (
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase border ${
            p.planStatus === "ACTIVE"
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              : "bg-amber-500/20 border-amber-500/40 text-amber-300"
          }`}
        >
          {p.planStatus}
        </span>
      ),
    },
    {
      key: "verificationStatus",
      header: "Verification",
      render: (p: ProducerItem) => (
        <ConsoleStatusBadge
          status={
            p.verificationStatus === "APPROVED"
              ? "active"
              : p.verificationStatus === "PENDING"
                ? "warning"
                : "suspended"
          }
          label={p.verificationStatus}
        />
      ),
    },
    {
      key: "submittedAt",
      header: "Submitted",
      render: (p: ProducerItem) => (
        <span className="text-xs text-slate-400">
          {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString() : "—"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right" as const,
      render: (p: ProducerItem) => (
        <button
          onClick={() => handleOpenReview(p)}
          className="px-3 py-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-bold text-xs transition"
        >
          Review Verification
        </button>
      ),
    },
  ];

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Producer Directory & Verification"
      tagline="Verify channel creator identities, compliance documentation and publishing licenses"
      activePath="/zillionaire/producers"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={fetchProducers}
      isRefreshing={loading}
    >
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

      <ConsoleWelcomeBanner
        title="Producer Verification Queue"
        description="All content creators submitting FAST channels or on-demand catalogue assets must be verified with verified corporate/identity documents before publishing."
        badgeText="Content Governance"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Total Registered Producers"
          value={kpis.total}
          subtitle="Creator partner registry"
          variant="blue"
          icon={Film}
        />
        <ConsoleKpiCard
          title="Verified Entities"
          value={kpis.verified}
          subtitle="Authorized to broadcast"
          variant="green"
          icon={CheckCircle2}
        />
        <ConsoleKpiCard
          title="Pending Verification Queue"
          value={kpis.pending}
          subtitle="Awaiting compliance review"
          variant="gold"
          icon={Clock}
        />
        <ConsoleKpiCard
          title="Active Subscription Plans"
          value={kpis.activePlan}
          subtitle="Live studio plans"
          variant="purple"
          icon={FileCheck}
        />
      </div>

      <ConsoleCard
        title="Producer Accounts"
        description="Review all registered producer entities, their legal verification status, and monetization eligibility."
      >
        <ConsoleTable
          columns={columns}
          data={producers}
          keyField="id"
          searchPlaceholder="Search producers by name or company..."
          emptyTitle="No producer accounts registered"
          emptyDescription="Producers who complete creator registration will appear here."
        />
      </ConsoleCard>

      {/* Review Modal */}
      {selectedProducer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Review Producer Verification</h3>
              </div>
              <button
                onClick={() => setSelectedProducer(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {reviewError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold">
                {reviewError}
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-800 bg-black/30 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Producer Entity:</span>
                  <span className="font-bold text-white">{selectedProducer.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Company Name:</span>
                  <span className="text-slate-300">{selectedProducer.companyName || "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Current Status:</span>
                  <span className="font-mono text-purple-300 font-bold">
                    {selectedProducer.verificationStatus}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Review Decision *</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "approve", label: "Approve", color: "emerald" },
                    { key: "request_evidence", label: "Request Info", color: "amber" },
                    { key: "reject", label: "Reject", color: "rose" },
                  ].map((act) => (
                    <button
                      type="button"
                      key={act.key}
                      onClick={() => setReviewAction(act.key as typeof reviewAction)}
                      className={`p-2 rounded-xl border text-center font-bold transition text-xs capitalize ${
                        reviewAction === act.key
                          ? `bg-${act.color}-500/20 border-${act.color}-500/50 text-${act.color}-300`
                          : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                      }`}
                    >
                      {act.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Audit Justification *
                </label>
                <textarea
                  rows={3}
                  placeholder="Record reasons for decision and compliance check notes..."
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white placeholder-slate-500 outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedProducer(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSubmitReview}
                  disabled={reviewBusy}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold transition shadow-lg shadow-purple-600/30 disabled:opacity-50"
                >
                  {reviewBusy ? "Submitting..." : "Confirm Decision"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
