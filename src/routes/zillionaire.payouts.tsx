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
  DollarSign,
  Search,
  CheckCircle2,
  XCircle,
  PauseCircle,
  PlayCircle,
  Calculator,
  Send,
  AlertTriangle,
  X,
  CreditCard,
  Building,
  User,
  Clock,
  ArrowRight,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";

export const Route = createFileRoute("/zillionaire/payouts")({
  component: ZillionairePayoutsRoute,
  head: () => ({
    meta: [
      { title: "Payouts Queue & Money Control | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface PayoutItem {
  id: string;
  uid: string;
  amountMinor: number;
  currency: string;
  status: "REQUESTED" | "APPROVED" | "SETTLED" | "REJECTED" | "HELD";
  payoutAccount: {
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    accountName?: string;
  } | null;
  settlementReference: string | null;
  reviewReason: string | null;
  settlementReason: string | null;
  holdReason: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  settledAt: string | null;
}

function ZillionairePayoutsRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="payouts"
      title="Payouts & Money Control"
      description="Producer and provider payouts queue, approval workflow, bank settlement verification, and revenue share live calculator."
    >
      {(token, account, onLock) => (
        <ZillionairePayoutsPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionairePayoutsPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Review Modal (Approve or Reject)
  const [reviewTarget, setReviewTarget] = useState<PayoutItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reviewReason, setReviewReason] = useState("");

  // Settle Modal (Mark as PAID)
  const [settleTarget, setSettleTarget] = useState<PayoutItem | null>(null);
  const [settlementRef, setSettlementRef] = useState("");
  const [settleReason, setSettleReason] = useState("");

  // Hold Modal
  const [holdTarget, setHoldTarget] = useState<PayoutItem | null>(null);
  const [holdAction, setHoldAction] = useState<"HOLD" | "UNHOLD">("HOLD");
  const [holdReason, setHoldReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Live Calculator State
  const [calcGrossRevenue, setCalcGrossRevenue] = useState<number>(1000000); // 1,000,000 NGN
  const [calcProducerSplit, setCalcProducerSplit] = useState<number>(70); // 70%

  const fetchPayouts = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/public/v1/zillionaire/payouts/?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPayouts(data.payouts || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayouts();
  }, [statusFilter, searchQuery]);

  const executeReview = async () => {
    if (!reviewTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payouts/${reviewTarget.id}/review`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ decision: reviewDecision, reason: reviewReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`Payout ${reviewTarget.id} marked as ${reviewDecision}D.`);
        setReviewTarget(null);
        setReviewReason("");
        await fetchPayouts();
      } else {
        setFeedback(`Review failed: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error executing review.");
    } finally {
      setSubmitting(false);
    }
  };

  const executeSettle = async () => {
    if (!settleTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payouts/${settleTarget.id}/settle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementReference: settlementRef.trim(),
          reason: settleReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`Payout ${settleTarget.id} settled as PAID with ref: ${settlementRef}. Producer notified.`);
        setSettleTarget(null);
        setSettlementRef("");
        setSettleReason("");
        await fetchPayouts();
      } else {
        setFeedback(`Settlement failed: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error settling payout.");
    } finally {
      setSubmitting(false);
    }
  };

  const executeHold = async () => {
    if (!holdTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payouts/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          payoutId: holdTarget.id,
          action: holdAction,
          reason: holdReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`Payout ${holdTarget.id} status changed to ${holdAction === "HOLD" ? "HELD" : "REQUESTED"}.`);
        setHoldTarget(null);
        setHoldReason("");
        await fetchPayouts();
      } else {
        setFeedback(`Hold action failed: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error updating hold status.");
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const total = payouts.length;
    const requested = payouts.filter((p) => p.status === "REQUESTED").length;
    const approved = payouts.filter((p) => p.status === "APPROVED").length;
    const settledAmountMinor = payouts
      .filter((p) => p.status === "SETTLED")
      .reduce((acc, p) => acc + p.amountMinor, 0);

    return { total, requested, approved, settledAmountMinor };
  }, [payouts]);

  // Calculator computations
  const producerEarnings = (calcGrossRevenue * calcProducerSplit) / 100;
  const platformRevenue = calcGrossRevenue - producerEarnings;

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Payouts & Money Control"
      subtitle="Producer earnings settlement, banking authorization, payout audit queue, and revenue share simulation."
      account={account}
      onLock={onLock}
      activePath="/zillionaire/payouts"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Payouts Queue & Money Operations"
          subtitle="All payouts require Review approval before bank settlement. Marking as PAID writes idempotent ledger entries and dispatches automatic notifications."
        />

        {feedback && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded-lg text-cyan-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>{feedback}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Requests"
            value={stats.total.toLocaleString()}
            change="All time submissions"
            icon={<CreditCard className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Awaiting Review"
            value={stats.requested.toLocaleString()}
            change="Action needed"
            icon={<Clock className="w-5 h-5" />}
            color="gold"
          />
          <ConsoleKpiCard
            title="Approved for Settlement"
            value={stats.approved.toLocaleString()}
            change="Ready for bank payment"
            icon={<DollarSign className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Settled Paid Volume"
            value={formatMoney(stats.settledAmountMinor, "NGN")}
            change="Disbursed to creators"
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="green"
          />
        </div>

        {/* Live Revenue Share Calculator Widget */}
        <ConsoleCard title="Owner Revenue Share Split Calculator (Internal Only)">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
            <div className="space-y-3">
              <label className="block font-semibold text-slate-300">
                Gross Streaming Revenue (NGN)
              </label>
              <input
                type="number"
                value={calcGrossRevenue}
                onChange={(e) => setCalcGrossRevenue(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Producers never see the gross pool or split percentage. They see only their final earnings.
              </p>
            </div>

            <div className="space-y-3">
              <label className="block font-semibold text-slate-300">
                Producer Share: <span className="text-cyan-400 font-bold">{calcProducerSplit}%</span>
              </label>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={calcProducerSplit}
                onChange={(e) => setCalcProducerSplit(Number(e.target.value))}
                className="w-full accent-cyan-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                <span>50/50</span>
                <span>70/30 (Default)</span>
                <span>80/20</span>
                <span>85/15</span>
                <span>100/0</span>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex justify-between items-center text-slate-300">
                <span>Creator Net Payout:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {formatMoney(producerEarnings * 100, "NGN")}
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span>Platform Margin (BQ):</span>
                <span className="font-mono font-bold text-cyan-400 text-sm">
                  {formatMoney(platformRevenue * 100, "NGN")}
                </span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between text-[11px] text-slate-400">
                <span>Contract Version:</span>
                <span className="font-mono text-slate-300">v4.2 Effective</span>
              </div>
            </div>
          </div>
        </ConsoleCard>

        {/* Filter and Search Bar */}
        <ConsoleCard title="Payouts Queue Filter">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by UID, payout ID, bank settlement reference..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1">
              {(["ALL", "REQUESTED", "APPROVED", "SETTLED", "REJECTED", "HELD"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === filter ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>
        </ConsoleCard>

        {/* Table */}
        <ConsoleCard title={`Payout Requests (${payouts.length} entries)`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading payout queue...</div>
          ) : payouts.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No payout requests found.</div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "payout", label: "Payout ID & Producer" },
                { key: "amount", label: "Amount Requested" },
                { key: "bank", label: "Bank Account Details" },
                { key: "status", label: "Status" },
                { key: "dates", label: "Requested / Settled" },
                { key: "actions", label: "Action Control" },
              ]}
              data={payouts.map((p) => ({
                id: p.id,
                payout: (
                  <div className="text-xs space-y-0.5">
                    <div className="font-mono font-bold text-white truncate max-w-[180px]">{p.id}</div>
                    <div className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>{p.uid}</span>
                    </div>
                  </div>
                ),
                amount: (
                  <div className="text-xs">
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {formatMoney(p.amountMinor, p.currency)}
                    </span>
                    <div className="text-slate-500 text-[10px]">{p.currency}</div>
                  </div>
                ),
                bank: (
                  <div className="text-xs space-y-0.5">
                    <div className="text-slate-200 font-medium flex items-center gap-1">
                      <Building className="w-3 h-3 text-slate-400" />
                      <span>{p.payoutAccount?.bankName || "Bank Transfer"}</span>
                    </div>
                    <div className="text-slate-400 font-mono text-[11px]">
                      {p.payoutAccount?.accountNumber || "N/A"}
                    </div>
                    {p.payoutAccount?.accountName && (
                      <div className="text-slate-500 text-[10px]">{p.payoutAccount.accountName}</div>
                    )}
                  </div>
                ),
                status: (
                  <div className="text-xs space-y-1">
                    <ConsoleStatusBadge
                      status={
                        p.status === "SETTLED"
                          ? "active"
                          : p.status === "APPROVED"
                          ? "warning"
                          : p.status === "REJECTED"
                          ? "error"
                          : "inactive"
                      }
                      label={p.status}
                    />
                    {p.settlementReference && (
                      <div className="text-[10px] text-cyan-400 font-mono truncate max-w-[120px]" title={p.settlementReference}>
                        Ref: {p.settlementReference}
                      </div>
                    )}
                  </div>
                ),
                dates: (
                  <div className="text-xs space-y-0.5 text-slate-400">
                    <div>Req: {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</div>
                    {p.settledAt && (
                      <div className="text-emerald-400 text-[11px]">
                        Paid: {new Date(p.settledAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ),
                actions: (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {/* Review: Approve / Reject (when REQUESTED or HELD) */}
                    {(p.status === "REQUESTED" || p.status === "HELD") && (
                      <>
                        <button
                          onClick={() => {
                            setReviewTarget(p);
                            setReviewDecision("APPROVE");
                            setReviewReason("");
                          }}
                          className="px-2 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded font-semibold"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setReviewTarget(p);
                            setReviewDecision("REJECT");
                            setReviewReason("");
                          }}
                          className="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded font-semibold"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {/* Settle: Mark as PAID (when APPROVED) */}
                    {p.status === "APPROVED" && (
                      <button
                        onClick={() => {
                          setSettleTarget(p);
                          setSettlementRef("");
                          setSettleReason("");
                        }}
                        className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center gap-1 shadow-lg shadow-cyan-950"
                      >
                        <Send className="w-3 h-3" /> Mark PAID
                      </button>
                    )}

                    {/* Hold / Unhold Toggle */}
                    {p.status === "REQUESTED" && (
                      <button
                        onClick={() => {
                          setHoldTarget(p);
                          setHoldAction("HOLD");
                          setHoldReason("");
                        }}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded"
                        title="Place Payout on Hold"
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {p.status === "HELD" && (
                      <button
                        onClick={() => {
                          setHoldTarget(p);
                          setHoldAction("UNHOLD");
                          setHoldReason("");
                        }}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded"
                        title="Resume Payout from Hold"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Modal: Review (Approve / Reject) */}
        {reviewTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  {reviewDecision === "APPROVE" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-5 h-5 text-red-400" />
                  )}
                  <h3 className="text-base font-bold text-white">
                    {reviewDecision === "APPROVE" ? "Approve Payout" : "Reject Payout Request"}
                  </h3>
                </div>
                <button onClick={() => setReviewTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <p className="text-slate-300">
                You are about to <strong>{reviewDecision}</strong> payout request for{" "}
                <span className="text-emerald-400 font-mono font-bold">
                  {formatMoney(reviewTarget.amountMinor, reviewTarget.currency)}
                </span>{" "}
                to creator <code className="text-cyan-300">{reviewTarget.uid}</code>.
              </p>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Audit Justification Reason (min 3 chars):
                </label>
                <textarea
                  rows={3}
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value)}
                  placeholder="e.g. Account verified and stream earnings reconciled."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || reviewReason.trim().length < 3}
                  onClick={executeReview}
                  className={`px-4 py-2 text-white font-bold rounded disabled:opacity-50 ${
                    reviewDecision === "APPROVE"
                      ? "bg-emerald-600 hover:bg-emerald-500"
                      : "bg-red-600 hover:bg-red-500"
                  }`}
                >
                  {submitting ? "Processing..." : `Confirm ${reviewDecision}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Settle (Mark as PAID) */}
        {settleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Disburse / Mark as PAID</h3>
                </div>
                <button onClick={() => setSettleTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Disbursement Amount:</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {formatMoney(settleTarget.amountMinor, settleTarget.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Recipient UID:</span>
                  <span className="font-mono text-white">{settleTarget.uid}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Target Bank:</span>
                  <span className="text-slate-200">
                    {settleTarget.payoutAccount?.bankName} ({settleTarget.payoutAccount?.accountNumber})
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Bank Settlement / Transfer Reference (min 4 chars)
                  </label>
                  <input
                    type="text"
                    value={settlementRef}
                    onChange={(e) => setSettlementRef(e.target.value)}
                    placeholder="e.g. NIP-20261119-9821829 or Paystack-TRF-0912"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    This reference will be emailed to the creator and logged in the immutable money ledger.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Settlement Reason / Notes (min 3 chars)
                  </label>
                  <input
                    type="text"
                    value={settleReason}
                    onChange={(e) => setSettleReason(e.target.value)}
                    placeholder="e.g. Authorized monthly creator settlement wire disbursed."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSettleTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || settlementRef.trim().length < 4 || settleReason.trim().length < 3}
                  onClick={executeSettle}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submitting ? "Settling..." : "Confirm & Mark PAID"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Hold / Unhold */}
        {holdTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <PauseCircle className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-white">
                    {holdAction === "HOLD" ? "Place Payout on Hold" : "Resume Payout from Hold"}
                  </h3>
                </div>
                <button onClick={() => setHoldTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Reason for {holdAction.toLowerCase()} (min 3 chars):
                </label>
                <textarea
                  rows={3}
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g. Identity verification pending / temporary compliance review"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setHoldTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || holdReason.trim().length < 3}
                  onClick={executeHold}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submitting ? "Updating..." : `Confirm ${holdAction}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
