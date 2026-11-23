import { useState, useEffect, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
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
  Ban,
  RotateCcw,
  DollarSign,
  Tv,
  CreditCard,
  Search,
  Filter,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";

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
  legalName: string;
  countryCode: string;
  entityType: string;
  planStatus: string;
  verificationStatus: string;
  verificationEvidenceUrl: string | null;
  hasEvidence: boolean;
  suspended: boolean;
  suspendedAt: string | null;
  suspendReason: string | null;
  payoutAccount: {
    bankCode?: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    currency?: string;
  } | null;
  submittedAt: string | null;
  verifiedAt: string | null;
}

interface ProducerDetailData {
  producer: ProducerItem;
  channels: Array<{
    id: string;
    title: string;
    handle: string;
    category: string;
    status: string;
    pricePerMinuteMinor: number;
    verified: boolean;
  }>;
  earnings: {
    balanceMinor: number;
    settledMinor: number;
    lifetimeMinor: number;
    currency: string;
  };
  payouts: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    settlementReference: string | null;
    createdAt: string | null;
  }>;
}

function ZillionaireProducersRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="producers">
      {({ token, account, onLock }) => (
        <ZillionaireProducersContent token={token} account={account} {...(onLock ? { onLock } : {})} />
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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Verification Review modal
  const [selectedProducer, setSelectedProducer] = useState<ProducerItem | null>(null);
  const [reviewAction, setReviewAction] = useState<"approve" | "reject" | "request_evidence">("approve");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Producer Detail modal (Channels & Earnings)
  const [detailModal, setDetailModal] = useState<ProducerDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Suspend / Unsuspend modal
  const [suspendModal, setSuspendModal] = useState<{ producer: ProducerItem; action: "suspend" | "unsuspend" } | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendBusy, setSuspendBusy] = useState(false);

  // Edit Payout Account modal
  const [payoutModal, setPayoutModal] = useState<ProducerItem | null>(null);
  const [payoutBankName, setPayoutBankName] = useState("");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutAccountNumber, setPayoutAccountNumber] = useState("");
  const [payoutAccountName, setPayoutAccountName] = useState("");
  const [payoutCurrency, setPayoutCurrency] = useState("NGN");
  const [payoutReason, setPayoutReason] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);

  const fetchProducers = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());

      const res = await fetch(`/api/public/v1/zillionaire/producers?${params.toString()}`, { headers });
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
  }, [token, statusFilter]);

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
      headers["Content-Type"] = "application/json";
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

  const handleOpenDetail = async (p: ProducerItem) => {
    setDetailLoading(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/producers/${p.id}/actions`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load producer details");
      setDetailModal(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading producer channels/earnings");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleConfirmSuspend = async () => {
    if (!suspendModal) return;
    if (!suspendReason.trim()) {
      alert("Please provide an audit reason.");
      return;
    }
    setSuspendBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch(`/api/public/v1/zillionaire/producers/${suspendModal.producer.id}/actions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: suspendModal.action,
          reason: suspendReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${suspendModal.action} producer`);

      setSuccessMessage(`Producer ${suspendModal.producer.displayName} has been ${suspendModal.action}ed.`);
      setSuspendModal(null);
      setSuspendReason("");
      void fetchProducers();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed action");
    } finally {
      setSuspendBusy(false);
    }
  };

  const handleOpenPayoutModal = (p: ProducerItem) => {
    setPayoutModal(p);
    setPayoutBankName(p.payoutAccount?.bankName || "");
    setPayoutBankCode(p.payoutAccount?.bankCode || "");
    setPayoutAccountNumber(p.payoutAccount?.accountNumber || "");
    setPayoutAccountName(p.payoutAccount?.accountName || p.displayName);
    setPayoutCurrency(p.payoutAccount?.currency || "NGN");
    setPayoutReason("");
  };

  const handleSavePayoutAccount = async () => {
    if (!payoutModal) return;
    if (!payoutBankName.trim() || !payoutAccountNumber.trim() || !payoutAccountName.trim() || !payoutReason.trim()) {
      alert("Please fill in bank name, account number, account name, and an audit reason.");
      return;
    }

    setPayoutBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch(`/api/public/v1/zillionaire/producers/${payoutModal.id}/actions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "update_payout_account",
          reason: payoutReason.trim(),
          payoutAccount: {
            bankCode: payoutBankCode.trim() || "044",
            bankName: payoutBankName.trim(),
            accountNumber: payoutAccountNumber.trim(),
            accountName: payoutAccountName.trim(),
            currency: payoutCurrency.trim().toUpperCase(),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update payout account");

      setSuccessMessage(`Updated verified payout details for ${payoutModal.displayName}.`);
      setPayoutModal(null);
      void fetchProducers();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to update payout account");
    } finally {
      setPayoutBusy(false);
    }
  };

  const kpis = useMemo(() => {
    const total = producers.length;
    const verified = producers.filter((p) => p.verificationStatus === "APPROVED").length;
    const pending = producers.filter((p) => p.verificationStatus === "PENDING").length;
    const suspended = producers.filter((p) => p.suspended).length;
    return { total, verified, pending, suspended };
  }, [producers]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Producer Directory & Verification"
      tagline="Verify channel creator identities, compliance documentation, payout settlement details, and channels"
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
          title="Suspended Accounts"
          value={kpis.suspended}
          subtitle="Broadcast disabled"
          variant="purple"
          icon={ShieldAlert}
        />
      </div>

      <ConsoleCard
        title="Producer Accounts"
        description="Review all registered producer entities, their legal verification status, monetization eligibility, channels, and verified payout details."
      >
        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name, company, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void fetchProducers()}
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 px-3 py-2 outline-none focus:border-purple-500"
            >
              <option value="ALL">All Verification Statuses</option>
              <option value="PENDING">Pending Review</option>
              <option value="APPROVED">Verified & Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="SUSPENDED">Suspended Producers</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                <th className="py-3 px-3">Producer Entity</th>
                <th className="py-3 px-3">Entity Type</th>
                <th className="py-3 px-3">Verification</th>
                <th className="py-3 px-3">Payout Account</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {producers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No producer accounts match criteria.
                  </td>
                </tr>
              ) : (
                producers.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/40 transition">
                    <td className="py-3 px-3">
                      <div className="flex flex-col">
                        <span className="font-bold text-white text-xs">{p.displayName}</span>
                        <span className="text-[11px] text-slate-400">
                          {p.companyName ? p.companyName : "Independent"} ({p.countryCode})
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono">{p.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-3 capitalize text-slate-300">{p.entityType.replace("_", " ")}</td>
                    <td className="py-3 px-3">
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
                    </td>
                    <td className="py-3 px-3">
                      {p.payoutAccount ? (
                        <div className="flex flex-col text-[11px]">
                          <span className="font-semibold text-white">{p.payoutAccount.bankName}</span>
                          <span className="font-mono text-slate-400">
                            •••• {p.payoutAccount.accountNumber?.slice(-4)} ({p.payoutAccount.currency})
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Not configured</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {p.suspended ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-rose-500/20 border border-rose-500/40 text-rose-300">
                          SUSPENDED
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                          ACTIVE
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        <button
                          onClick={() => handleOpenReview(p)}
                          className="px-2.5 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 font-bold text-xs transition"
                          title="Review verification documents"
                        >
                          Verify
                        </button>
                        <button
                          onClick={() => handleOpenDetail(p)}
                          className="px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 font-bold text-xs transition"
                          title="View channels and earnings"
                        >
                          Channels
                        </button>
                        <button
                          onClick={() => handleOpenPayoutModal(p)}
                          className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs transition"
                          title="Edit verified payout details"
                        >
                          Payout
                        </button>
                        {p.suspended ? (
                          <button
                            onClick={() => setSuspendModal({ producer: p, action: "unsuspend" })}
                            className="px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-bold text-xs transition"
                            title="Unsuspend producer"
                          >
                            Unsuspend
                          </button>
                        ) : (
                          <button
                            onClick={() => setSuspendModal({ producer: p, action: "suspend" })}
                            className="px-2 py-1 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-bold text-xs transition"
                            title="Suspend producer"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ConsoleCard>

      {/* Verification Review Modal */}
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
                  <span className="text-slate-400">Entity Type:</span>
                  <span className="text-slate-300 capitalize">{selectedProducer.entityType.replace("_", " ")}</span>
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

      {/* Producer Detail Modal: Channels & Earnings */}
      {detailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Tv className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">
                  Channels & Earnings: {detailModal.producer.displayName}
                </h3>
              </div>
              <button
                onClick={() => setDetailModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Earnings summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Available Balance</span>
                  <span className="text-base font-extrabold text-emerald-400">
                    {formatMoney(detailModal.earnings.balanceMinor, detailModal.earnings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Settled to Date</span>
                  <span className="text-base font-extrabold text-blue-400">
                    {formatMoney(detailModal.earnings.settledMinor, detailModal.earnings.currency)}
                  </span>
                </div>
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
                  <span className="text-slate-400 block text-[11px]">Lifetime Earnings</span>
                  <span className="text-base font-extrabold text-purple-400">
                    {formatMoney(detailModal.earnings.lifetimeMinor, detailModal.earnings.currency)}
                  </span>
                </div>
              </div>

              {/* Channels list */}
              <div>
                <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-blue-400" />
                  Assigned Channels ({detailModal.channels.length})
                </h4>
                {detailModal.channels.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-black/20 rounded-xl border border-slate-800">
                    No channels assigned to this producer yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailModal.channels.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white block">{c.title}</span>
                          <span className="text-[11px] text-slate-400">
                            @{c.handle || c.id} • Category: {c.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-slate-300">
                            {formatMoney(c.pricePerMinuteMinor, "NGN")}/min
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              c.status === "published"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Payouts */}
              <div>
                <h4 className="font-bold text-sm text-white mb-2 flex items-center gap-1.5">
                  <DollarSign className="h-4 w-4 text-emerald-400" />
                  Recent Payout History ({detailModal.payouts.length})
                </h4>
                {detailModal.payouts.length === 0 ? (
                  <p className="text-slate-500 italic p-3 bg-black/20 rounded-xl border border-slate-800">
                    No payout records for this producer.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detailModal.payouts.map((po) => (
                      <div
                        key={po.id}
                        className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800/80 flex items-center justify-between"
                      >
                        <div>
                          <span className="font-mono text-slate-300 font-semibold">{po.id}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {po.createdAt ? new Date(po.createdAt).toLocaleDateString() : "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            {formatMoney(po.amountMinor, po.currency)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              po.status === "SETTLED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-amber-500/20 text-amber-300"
                            }`}
                          >
                            {po.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end">
                <button
                  type="button"
                  onClick={() => setDetailModal(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suspend / Unsuspend Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-rose-400" />
                <h3 className="text-base font-bold text-white capitalize">
                  {suspendModal.action} Producer
                </h3>
              </div>
              <button
                onClick={() => setSuspendModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-3">
              {suspendModal.action === "suspend"
                ? `Suspending ${suspendModal.producer.displayName} will lock their channels and halt all payout disbursements.`
                : `Unsuspending ${suspendModal.producer.displayName} will restore broadcast and payout privileges.`}
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Audit Justification *</label>
                <textarea
                  rows={3}
                  placeholder={`Reason for ${suspendModal.action}...`}
                  value={suspendReason}
                  onChange={(e) => setSuspendReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white placeholder-slate-500 outline-none focus:border-rose-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSuspendModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSuspend}
                  disabled={suspendBusy}
                  className={`px-5 py-2 rounded-xl font-bold text-white transition disabled:opacity-50 ${
                    suspendModal.action === "suspend"
                      ? "bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30"
                      : "bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30"
                  }`}
                >
                  {suspendBusy ? "Processing..." : `Confirm ${suspendModal.action}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Verified Payout Account Modal */}
      {payoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Edit Verified Payout Details</h3>
              </div>
              <button
                onClick={() => setPayoutModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-400 text-[11px]">
                Modifying bank details for <strong className="text-white">{payoutModal.displayName}</strong> requires an explicit audit log trail.
              </p>

              <div>
                <label className="block text-slate-400 mb-1">Bank Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Access Bank, Zenith Bank"
                  value={payoutBankName}
                  onChange={(e) => setPayoutBankName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Bank Code</label>
                <input
                  type="text"
                  placeholder="e.g. 044"
                  value={payoutBankCode}
                  onChange={(e) => setPayoutBankCode(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Account Number *</label>
                <input
                  type="text"
                  placeholder="e.g. 0123456789"
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white font-mono outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Account Name *</label>
                <input
                  type="text"
                  placeholder="Beneficiary legal entity name"
                  value={payoutAccountName}
                  onChange={(e) => setPayoutAccountName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Settlement Currency</label>
                <select
                  value={payoutCurrency}
                  onChange={(e) => setPayoutCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white outline-none focus:border-amber-500"
                >
                  <option value="NGN">NGN - Nigerian Naira</option>
                  <option value="USD">USD - US Dollar</option>
                  <option value="GBP">GBP - British Pound</option>
                  <option value="EUR">EUR - Euro</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Audit Justification *</label>
                <textarea
                  rows={2}
                  placeholder="Reason for modifying verified payout account..."
                  value={payoutReason}
                  onChange={(e) => setPayoutReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2 text-white outline-none focus:border-amber-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPayoutModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePayoutAccount}
                  disabled={payoutBusy}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition shadow-lg shadow-amber-600/30 disabled:opacity-50"
                >
                  {payoutBusy ? "Saving..." : "Save Payout Details"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
