import { useState, useEffect, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  RotateCcw,
  Download,
  Calendar,
  ExternalLink,
  FileText,
  Copy,
  Check,
  FileSpreadsheet,
  Eye,
  CheckSquare,
  Square,
  ShieldCheck,
  Sliders,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";
import { getNextPayoutWindow } from "@/lib/payout-calendar";
import { generateReceiptHtml, triggerPrintOrDownload } from "@/lib/pdf-statement";

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
  paidAmountMinor?: number;
  currency: string;
  status:
    | "REQUESTED"
    | "APPROVED"
    | "SETTLED"
    | "PARTIALLY_PAID"
    | "FAILED"
    | "REVERSED"
    | "REJECTED"
    | "HELD";
  payoutAccount: {
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    accountName?: string;
  } | null;
  settlementReference: string | null;
  reversalReference?: string | null;
  reviewReason: string | null;
  settlementReason: string | null;
  holdReason: string | null;
  reversalReason?: string | null;
  failureReason?: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
  settledAt: string | null;
  reversedAt?: string | null;
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

  // Settle Modal (Mark as PAID / PARTIAL / FAILED)
  const [settleTarget, setSettleTarget] = useState<PayoutItem | null>(null);
  const [settleAction, setSettleAction] = useState<"SETTLE" | "PARTIAL" | "FAIL">("SETTLE");
  const [settleAmountMinor, setSettleAmountMinor] = useState<number>(0);
  const [settleDate, setSettleDate] = useState<string>("");
  const [settlementRef, setSettlementRef] = useState("");
  const [settleReason, setSettleReason] = useState("");

  // Reversal Modal
  const [reversalTarget, setReversalTarget] = useState<PayoutItem | null>(null);
  const [reversalRef, setReversalRef] = useState("");
  const [reversalReason, setReversalReason] = useState("");

  // Hold Modal
  const [holdTarget, setHoldTarget] = useState<PayoutItem | null>(null);
  const [holdAction, setHoldAction] = useState<"HOLD" | "UNHOLD">("HOLD");
  const [holdReason, setHoldReason] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Transfer Details Panel state
  const [transferTarget, setTransferTarget] = useState<PayoutItem | null>(null);
  const [transferDetails, setTransferDetails] = useState<any | null>(null);
  const [loadingTransfer, setLoadingTransfer] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Selected payouts for batch actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportingBatch, setExportingBatch] = useState(false);

  // Settle receipt URL/path
  const [settleReceiptPath, setSettleReceiptPath] = useState("");

  // Live Calculator State
  const [calcGrossRevenue, setCalcGrossRevenue] = useState<number>(1000000); // 1,000,000 NGN
  const [calcProducerSplit, setCalcProducerSplit] = useState<number>(70); // 70%

  const payoutWindow = getNextPayoutWindow();

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

  const openTransferDetails = async (p: PayoutItem) => {
    setTransferTarget(p);
    setLoadingTransfer(true);
    setTransferDetails(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payouts/${p.id}/transfer-details`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTransferDetails(data);
      } else {
        setFeedback("Failed to load transfer details.");
      }
    } catch {
      setFeedback("Error loading transfer details.");
    } finally {
      setLoadingTransfer(false);
    }
  };

  const copyTransferField = async (key: string, value: string, payoutId: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);

      const headers = await getWebAuthHeaders();
      fetch(`/api/public/v1/zillionaire/payouts/${payoutId}/audit-copy`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ field: key }),
      }).catch(() => {});
    } catch {
      // clipboard fallback
    }
  };

  const handleBatchExport = async (group: "LOCAL" | "INTERNATIONAL" | "ALL") => {
    setExportingBatch(true);
    try {
      const headers = await getWebAuthHeaders();
      const payload: { group: string; payoutIds?: string[] } = { group };
      if (selectedIds.size > 0) {
        payload.payoutIds = Array.from(selectedIds);
      }
      const res = await fetch("/api/public/v1/zillionaire/payouts/export", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.csv) {
        const blob = new Blob([data.csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `payouts_${group.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setFeedback(`Exported ${data.totalExported} payout records as CSV.`);
      } else {
        setFeedback(`Batch export failed: ${data.message || data.error || "No records"}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error exporting batch.");
    } finally {
      setExportingBatch(false);
    }
  };

  const toggleSelectAllApproved = () => {
    const approved = payouts.filter((p) => p.status === "APPROVED");
    if (selectedIds.size === approved.length && approved.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(approved.map((p) => p.id)));
    }
  };

  // Rules and Limits Modal state
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [rulesMinUSD, setRulesMinUSD] = useState(500);
  const [rulesMinNGN, setRulesMinNGN] = useState(750000);
  const [rulesRate, setRulesRate] = useState(1500);
  const [rulesDualUSD, setRulesDualUSD] = useState(5000);
  const [rulesStepUpUSD, setRulesStepUpUSD] = useState(1000);
  const [rulesReason, setRulesReason] = useState("");
  const [savingRules, setSavingRules] = useState(false);

  const fetchRules = async () => {
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/payouts/rules", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.rules) {
          setRulesMinUSD(Math.round(data.rules.minimumPayoutUSDMinor / 100));
          setRulesMinNGN(Math.round(data.rules.minimumPayoutNGNMinor / 100));
          setRulesRate(data.rules.usdToNgnRate);
          setRulesDualUSD(Math.round(data.rules.dualApprovalThresholdUSDMinor / 100));
          setRulesStepUpUSD(Math.round(data.rules.stepUpThresholdUSDMinor / 100));
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSaveRules = async () => {
    if (!rulesReason.trim()) {
      setFeedback("A reason is required to update payout rules.");
      return;
    }
    setSavingRules(true);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch("/api/public/v1/zillionaire/payouts/rules", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          minimumPayoutUSDMinor: rulesMinUSD * 100,
          minimumPayoutNGNMinor: rulesMinNGN * 100,
          usdToNgnRate: rulesRate,
          dualApprovalThresholdUSDMinor: rulesDualUSD * 100,
          dualApprovalThresholdNGNMinor: Math.round(rulesDualUSD * rulesRate * 100),
          stepUpThresholdUSDMinor: rulesStepUpUSD * 100,
          stepUpThresholdNGNMinor: Math.round(rulesStepUpUSD * rulesRate * 100),
          reason: rulesReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback("Payout currency rules, limits, and safety settings updated successfully.");
        setShowRulesModal(false);
        setRulesReason("");
      } else {
        setFeedback(`Failed to update rules: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error saving rules.");
    } finally {
      setSavingRules(false);
    }
  };

  const toggleSelectPayout = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSettleModal = (p: PayoutItem) => {
    setSettleTarget(p);
    setSettleAction("SETTLE");
    setSettleAmountMinor(p.amountMinor);
    setSettleDate(new Date().toISOString());
    setSettlementRef("");
    setSettleReason("");
    setSettleReceiptPath("");
  };

  const executeSettle = async () => {
    if (!settleTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const payload: Record<string, unknown> = {
        action: settleAction,
        settlementReference: settlementRef.trim(),
        reason: settleReason.trim(),
        paymentDate: settleDate || new Date().toISOString(),
        receiptPath: settleReceiptPath.trim() || undefined,
      };
      if (settleAction === "PARTIAL") {
        payload.paidAmountMinor = settleAmountMinor;
      } else if (settleAction === "SETTLE") {
        payload.paidAmountMinor = settleTarget.amountMinor;
      }

      const res = await fetch(`/api/public/v1/zillionaire/payouts/${settleTarget.id}/settle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`Payout ${settleTarget.id} updated (${settleAction}) with ref: ${settlementRef}. Beneficiary notified.`);
        setSettleTarget(null);
        setSettlementRef("");
        setSettleReason("");
        setSettleReceiptPath("");
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

  const executeReversal = async () => {
    if (!reversalTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payouts/${reversalTarget.id}/settle`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "REVERSE",
          settlementReference: reversalRef.trim(),
          reason: reversalReason.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(`Payout ${reversalTarget.id} successfully reversed. Ledger entry preserved.`);
        setReversalTarget(null);
        setReversalRef("");
        setReversalReason("");
        await fetchPayouts();
      } else {
        setFeedback(`Reversal failed: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error executing reversal.");
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

  const handleDownloadReceipt = (p: PayoutItem) => {
    const html = generateReceiptHtml({
      receiptId: `rcpt_${p.id.slice(0, 16)}`,
      payoutId: p.id,
      recipientUid: p.uid,
      recipientName: p.payoutAccount?.accountName || p.uid,
      amountMinor: p.paidAmountMinor ?? p.amountMinor,
      currency: p.currency,
      status: p.status,
      settlementReference: p.settlementReference || "PENDING",
      paymentDate: p.settledAt || p.createdAt || new Date().toISOString(),
      reversalReference: p.reversalReference,
      isReversed: p.status === "REVERSED",
    });
    triggerPrintOrDownload(html, `receipt-${p.id}`);
  };

  const stats = useMemo(() => {
    const total = payouts.length;
    const requested = payouts.filter((p) => p.status === "REQUESTED").length;
    const approved = payouts.filter((p) => p.status === "APPROVED").length;
    const settledAmountMinor = payouts
      .filter((p) => p.status === "SETTLED" || p.status === "PARTIALLY_PAID")
      .reduce((acc, p) => acc + (p.paidAmountMinor ?? p.amountMinor), 0);

    return { total, requested, approved, settledAmountMinor };
  }, [payouts]);

  // Calculator computations
  const producerEarnings = (calcGrossRevenue * calcProducerSplit) / 100;
  const platformRevenue = calcGrossRevenue - producerEarnings;

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Zillionaire Control Centre"
      tagline="Payouts Queue & Money Control"
      activePath="/zillionaire/payouts"
      account={account}
      onLock={onLock}
      onRefresh={fetchPayouts}
      isRefreshing={loading}
    >
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <ConsoleWelcomeBanner
          title="Payout Operations & Ledger Review"
          description="Enforce strict KYC and payout verification. Payments occur between the 30th and the 1st of each month. Payment records are permanent and never deleted."
        />

        {/* Next Payout Calendar & Disclosure Banner */}
        <div className="rounded-2xl border border-cyan-400/20 bg-[#040e30]/80 p-5 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-cyan-300 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                    Monthly Payout Schedule
                  </span>
                  <span className="rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-cyan-200">
                    {payoutWindow.nextPayoutDateFormatted}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed font-medium">
                  {payoutWindow.disclosure}
                </p>
              </div>
            </div>
            <Link
              to="/payment-and-payout-policy"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-300 hover:text-cyan-200 shrink-0 self-start sm:self-center"
            >
              <span>View Policy Page</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {feedback && (
          <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800 text-cyan-200 text-xs flex justify-between items-center">
            <span>{feedback}</span>
            <button onClick={() => setFeedback(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            title="Disbursed Volume"
            value={formatMoney(stats.settledAmountMinor, "NGN")}
            change="Disbursed to partners"
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="green"
          />
        </div>

        {/* Top Action Bar: Rules & Safety Settings */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              fetchRules();
              setShowRulesModal(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs text-cyan-300 font-semibold shadow"
          >
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>Currency & Safety Rules</span>
          </button>
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

        {/* Payouts Table Filter Controls */}
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {["ALL", "REQUESTED", "PENDING_SECOND_APPROVAL", "APPROVED", "SETTLED", "PARTIALLY_PAID", "FAILED", "REVERSED", "HELD", "REJECTED"].map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    statusFilter === st
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                      : "bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  {st}
                </button>
              ),
            )}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search reference, UID, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Batch Export & Selection Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAllApproved}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-xs text-slate-200 font-medium"
            >
              {selectedIds.size > 0 && selectedIds.size === payouts.filter((p) => p.status === "APPROVED").length ? (
                <CheckSquare className="w-4 h-4 text-cyan-400" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Select Approved ({selectedIds.size})</span>
            </button>
            {selectedIds.size > 0 && (
              <span className="text-[11px] text-cyan-400 font-mono">
                {selectedIds.size} payout(s) selected
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">
              Batch Export:
            </span>
            <button
              disabled={exportingBatch}
              onClick={() => handleBatchExport("LOCAL")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-semibold disabled:opacity-50"
              title="Download NGN bank transfer batch CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Local (NGN)</span>
            </button>
            <button
              disabled={exportingBatch}
              onClick={() => handleBatchExport("INTERNATIONAL")}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 text-xs font-semibold disabled:opacity-50"
              title="Download USD/Foreign wire transfer batch CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export International (USD)</span>
            </button>
            <button
              disabled={exportingBatch}
              onClick={() => handleBatchExport("ALL")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium disabled:opacity-50"
              title="Export all selected or approved payouts"
            >
              <Download className="w-3.5 h-3.5" />
              <span>All CSV</span>
            </button>
          </div>
        </div>

        {/* Payouts Table */}
        <ConsoleCard title={`Disbursement Ledger Records (${payouts.length})`}>
          {payouts.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No payout records match current filters.
            </div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "select", header: "Select" },
                { key: "payout", header: "Payout & Recipient" },
                { key: "amount", header: "Amount" },
                { key: "bank", header: "Banking Details" },
                { key: "status", header: "Status & Ref" },
                { key: "dates", header: "Timestamp (Date & Time)" },
                { key: "actions", header: "Owner Actions" },
              ]}
              data={payouts.map((p) => ({
                id: p.id,
                select: (
                  <button
                    onClick={() => toggleSelectPayout(p.id)}
                    className="p-1 hover:text-white"
                    title="Select payout for batch export"
                  >
                    {selectedIds.has(p.id) ? (
                      <CheckSquare className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                    )}
                  </button>
                ),
                payout: (
                  <div className="text-xs space-y-1">
                    <div className="font-mono font-bold text-white flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{p.id.slice(0, 16)}...</span>
                    </div>
                    <div className="text-slate-400 text-[11px] flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span>UID: {p.uid.slice(0, 16)}...</span>
                    </div>
                  </div>
                ),
                amount: (
                  <div className="text-xs">
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {formatMoney(p.paidAmountMinor ?? p.amountMinor, p.currency)}
                    </span>
                    {p.paidAmountMinor && p.paidAmountMinor < p.amountMinor && (
                      <div className="text-amber-400 text-[10px]">
                        Req: {formatMoney(p.amountMinor, p.currency)}
                      </div>
                    )}
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
                          : p.status === "PENDING_SECOND_APPROVAL"
                          ? "warning"
                          : p.status === "APPROVED"
                          ? "warning"
                          : p.status === "PARTIALLY_PAID"
                          ? "warning"
                          : p.status === "REVERSED"
                          ? "inactive"
                          : p.status === "FAILED" || p.status === "REJECTED"
                          ? "error"
                          : "inactive"
                      }
                      label={p.status}
                    />
                    {p.settlementReference && (
                      <div className="text-[10px] text-cyan-400 font-mono truncate max-w-[130px]" title={p.settlementReference}>
                        Ref: {p.settlementReference}
                      </div>
                    )}
                    {p.reversalReference && (
                      <div className="text-[10px] text-rose-400 font-mono truncate max-w-[130px]" title={p.reversalReference}>
                        Rev: {p.reversalReference}
                      </div>
                    )}
                  </div>
                ),
                dates: (
                  <div className="text-xs space-y-0.5 text-slate-400">
                    <div>Req: {p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}</div>
                    {p.settledAt && (
                      <div className="text-emerald-400 text-[11px]">
                        Paid: {new Date(p.settledAt).toLocaleString()}
                      </div>
                    )}
                    {p.reversedAt && (
                      <div className="text-rose-400 text-[11px]">
                        Rev: {new Date(p.reversedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ),
                actions: (
                  <div className="flex flex-wrap items-center gap-1 text-[11px]">
                    {/* Dual Approval: Second Reviewer */}
                    {p.status === "PENDING_SECOND_APPROVAL" && (
                      <>
                        <button
                          onClick={() => {
                            setReviewTarget(p);
                            setReviewDecision("APPROVE");
                            setReviewReason("");
                          }}
                          className="px-2 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded font-semibold flex items-center gap-1"
                          title="Authorize second reviewer approval"
                        >
                          <ShieldCheck className="w-3 h-3" /> 2nd Approval
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

                    {/* Approved Actions: Transfer Details & Mark PAID */}
                    {p.status === "APPROVED" && (
                      <>
                        <button
                          onClick={() => openTransferDetails(p)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-cyan-300 font-semibold rounded flex items-center gap-1 shadow"
                          title="Open transfer details panel in bank form order"
                        >
                          <Eye className="w-3 h-3" /> Transfer Details
                        </button>
                        <button
                          onClick={() => openSettleModal(p)}
                          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center gap-1 shadow-lg shadow-cyan-950"
                        >
                          <Send className="w-3 h-3" /> Mark PAID
                        </button>
                      </>
                    )}

                    {/* Return to Hold: For Failed or Returned Transfers */}
                    {(p.status === "FAILED" || p.status === "REVERSED") && (
                      <button
                        onClick={() => {
                          setHoldTarget(p);
                          setHoldAction("HOLD");
                          setHoldReason("Transfer returned or failed; moved back to hold for review.");
                        }}
                        className="px-2 py-1 bg-amber-950/70 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded font-semibold flex items-center gap-1 text-[11px]"
                        title="Move returned or failed transfer back to Hold"
                      >
                        <RotateCcw className="w-3 h-3" /> Return to Hold
                      </button>
                    )}

                    {/* Reverse Action: Available for Settled / Partially Paid payouts */}
                    {(p.status === "SETTLED" || p.status === "PARTIALLY_PAID") && (
                      <button
                        onClick={() => {
                          setReversalTarget(p);
                          setReversalRef(`REV-${Date.now().toString().slice(-6)}`);
                          setReversalReason("");
                        }}
                        className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded font-semibold flex items-center gap-1"
                        title="Reverse Payout Entry (Keeps Original Record)"
                      >
                        <RotateCcw className="w-3 h-3" /> Reverse
                      </button>
                    )}

                    {/* Download Signed Receipt PDF */}
                    {(p.status === "SETTLED" || p.status === "PARTIALLY_PAID" || p.status === "REVERSED") && (
                      <button
                        onClick={() => handleDownloadReceipt(p)}
                        className="p-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded"
                        title="Download Receipt (PDF)"
                      >
                        <Download className="w-3.5 h-3.5" />
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

        {/* Modal: Transfer Details (Panel matching exact transfer form order with one-tap copy) */}
        {transferTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-cyan-500/30 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl text-xs overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800 p-4 bg-slate-950/60">
                <div className="flex items-center gap-2">
                  <Building className="w-5 h-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-bold text-white">Transfer Details — Wire Settlement</h3>
                    <p className="text-[11px] text-slate-400">
                      Exact fields in ALAT / bank transfer order with one-tap copy for owner. All views and copies are audited.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setTransferTarget(null);
                    setTransferDetails(null);
                  }}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto space-y-4">
                {loadingTransfer ? (
                  <div className="text-center py-12 text-slate-400">Loading transfer details...</div>
                ) : !transferDetails ? (
                  <div className="text-center py-12 text-rose-400">Failed to load transfer details.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Payout ID:</span>
                        <span className="font-mono text-cyan-300 font-bold">{transferDetails.payoutId}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Transfer Amount:</span>
                        <span className="font-mono text-emerald-400 font-bold text-sm">
                          {transferDetails.currency} {transferDetails.amountFormatted}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Route Type:</span>
                        <span className="font-semibold text-slate-200">
                          {transferDetails.isLocal ? "Local (Nigeria NGN)" : "International (SWIFT USD)"}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                        Transfer Form Fields (Click to copy):
                      </h4>
                      <div className="space-y-2">
                        {transferDetails.orderedFields?.map((field: any, idx: number) => (
                          <div
                            key={field.key}
                            className="flex items-center justify-between gap-3 p-2.5 bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-lg transition"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] text-slate-400 font-medium block">
                                {idx + 1}. {field.label}
                              </span>
                              <span className="font-mono text-slate-100 text-xs font-semibold select-all break-all">
                                {field.value || "—"}
                              </span>
                            </div>
                            {field.value && (
                              <button
                                type="button"
                                onClick={() => copyTransferField(field.key, field.value, transferDetails.payoutId)}
                                className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition shrink-0 ${
                                  copiedKey === field.key
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-800 hover:bg-slate-700 text-cyan-300"
                                }`}
                              >
                                {copiedKey === field.key ? (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Copied</span>
                                  </>
                                ) : (
                                  <>
                                    <Copy className="w-3 h-3" />
                                    <span>Copy</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex items-center justify-between border-t border-slate-800 p-3 bg-slate-950/60">
                <span className="text-[10px] text-slate-400">
                  Account numbers unmasked for owner only. Copies are logged in audit ledger.
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTransferTarget(null);
                      setTransferDetails(null);
                    }}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold text-xs"
                  >
                    Close
                  </button>
                  {transferTarget.status === "APPROVED" && (
                    <button
                      type="button"
                      onClick={() => {
                        const target = transferTarget;
                        setTransferTarget(null);
                        setTransferDetails(null);
                        openSettleModal(target);
                      }}
                      className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded flex items-center gap-1 text-xs"
                    >
                      <Send className="w-3 h-3" />
                      <span>Proceed to Mark PAID</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Review (Approve / Reject) */}
        {reviewTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400" />
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

        {/* Modal: Settle (Mark as PAID / PARTIAL / FAILED) */}
        {settleTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white">Disburse Payout</h3>
                </div>
                <button onClick={() => setSettleTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Action Selector: Paid / Partial / Failed */}
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Execution Status:</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSettleAction("SETTLE")}
                    className={`py-1.5 px-2 rounded-lg font-bold border transition ${
                      settleAction === "SETTLE"
                        ? "bg-emerald-600 border-emerald-400 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Paid in Full
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleAction("PARTIAL")}
                    className={`py-1.5 px-2 rounded-lg font-bold border transition ${
                      settleAction === "PARTIAL"
                        ? "bg-amber-600 border-amber-400 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Partial
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettleAction("FAIL")}
                    className={`py-1.5 px-2 rounded-lg font-bold border transition ${
                      settleAction === "FAIL"
                        ? "bg-rose-600 border-rose-400 text-white"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Failed
                  </button>
                </div>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Requested Amount:</span>
                  <span className="text-white font-mono font-bold">
                    {formatMoney(settleTarget.amountMinor, settleTarget.currency)}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Target Bank:</span>
                  <span className="text-slate-200">
                    {settleTarget.payoutAccount?.bankName} ({settleTarget.payoutAccount?.accountNumber})
                  </span>
                </div>
              </div>

              {/* Partial Amount Input */}
              {settleAction === "PARTIAL" && (
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Disbursed Partial Amount (Minor Units e.g. Kobo / Cents):
                  </label>
                  <input
                    type="number"
                    value={settleAmountMinor}
                    onChange={(e) => setSettleAmountMinor(Math.max(1, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                  <p className="text-[10px] text-amber-300 mt-1">
                    Effective: {formatMoney(settleAmountMinor, settleTarget.currency)}
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Bank / ALAT Transfer Reference (min 4 chars)
                  </label>
                  <input
                    type="text"
                    value={settlementRef}
                    onChange={(e) => setSettlementRef(e.target.value)}
                    placeholder="e.g. WEMA-ALAT-20261120-9812 or SWIFT-WIRE-00129"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    This reference will be emailed to the creator and logged in the immutable money ledger.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Optional Bank Receipt Path / Link:
                  </label>
                  <input
                    type="text"
                    value={settleReceiptPath}
                    onChange={(e) => setSettleReceiptPath(e.target.value)}
                    placeholder="e.g. receipts/wema_wire_confirmation_202611.pdf"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono text-[11px]"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Optional bank confirmation or wire advice receipt to attach to the payout email.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Payment Date & Time (ISO format)
                  </label>
                  <input
                    type="text"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    {settleAction === "FAIL" ? "Failure Reason (min 3 chars)" : "Settlement Notes (min 3 chars)"}
                  </label>
                  <input
                    type="text"
                    value={settleReason}
                    onChange={(e) => setSettleReason(e.target.value)}
                    placeholder={
                      settleAction === "FAIL"
                        ? "e.g. Invalid bank account name mismatch from KYC"
                        : "e.g. Authorized monthly creator settlement wire disbursed."
                    }
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
                  className={`px-4 py-2 text-white rounded font-bold disabled:opacity-50 ${
                    settleAction === "FAIL"
                      ? "bg-rose-600 hover:bg-rose-500"
                      : settleAction === "PARTIAL"
                      ? "bg-amber-600 hover:bg-amber-500"
                      : "bg-cyan-600 hover:bg-cyan-500"
                  }`}
                >
                  {submitting ? "Processing..." : `Confirm & Mark ${settleAction === "SETTLE" ? "PAID" : settleAction}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Reversal (Reversal entry only; record is NEVER deleted) */}
        {reversalTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-rose-800 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-5 h-5 text-rose-400" />
                  <h3 className="text-base font-bold text-white">Reverse Payout Entry</h3>
                </div>
                <button onClick={() => setReversalTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="rounded-lg bg-rose-950/40 border border-rose-800/60 p-3 text-rose-200">
                <p className="font-semibold text-rose-100 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  Ledger Permanence Rule:
                </p>
                <p className="mt-1 text-[11px] text-rose-300">
                  Payment records are never deleted. Executing this will generate a linked reversal document,
                  record full timestamps, and update payout status to REVERSED.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Reversal Reference / Tracking Code (min 4 chars):
                </label>
                <input
                  type="text"
                  value={reversalRef}
                  onChange={(e) => setReversalRef(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Reversal Justification Reason (min 3 chars):
                </label>
                <textarea
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Bank recall due to incorrect account number provided by beneficiary"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversalTarget(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || reversalRef.trim().length < 4 || reversalReason.trim().length < 3}
                  onClick={executeReversal}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded font-bold"
                >
                  {submitting ? "Reversing..." : "Execute Reversal"}
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
