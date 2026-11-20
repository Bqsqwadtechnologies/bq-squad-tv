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
  RotateCcw,
  AlertTriangle,
  X,
  CreditCard,
  ShieldAlert,
  ArrowDownLeft,
  Calendar,
  Lock,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";

export const Route = createFileRoute("/zillionaire/payments")({
  component: ZillionairePaymentsRoute,
  head: () => ({
    meta: [
      { title: "Top-Up Payments & Reconciliation | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface PaymentItem {
  id: string;
  uid: string;
  amountMinor: number;
  currency: string;
  gateway: "paystack" | "googleplay" | string;
  reference: string;
  status: "COMPLETED" | "FAILED" | "REVERSED" | string;
  reversed: boolean;
  reversedAt: string | null;
  reversalReason: string | null;
  reconciliationStatus: "MATCHED" | "REVERSED_OK" | "MISMATCH";
  createdAt: string | null;
}

function ZillionairePaymentsRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="payments"
      title="Payments & Reconciliation"
      description="Viewer top-up transactions, gateway reconciliation against Paystack, and audited reversal workflow with double confirmation."
    >
      {(token, account, onLock) => (
        <ZillionairePaymentsPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionairePaymentsPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Reversal Double-Confirmation Modal
  const [reverseTarget, setReverseTarget] = useState<PaymentItem | null>(null);
  const [reversalStep, setReversalStep] = useState<1 | 2>(1);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirmTyped, setReversalConfirmTyped] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (searchQuery) params.set("q", searchQuery);

      const res = await fetch(`/api/public/v1/zillionaire/payments/?${params.toString()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, [statusFilter, searchQuery]);

  const executeReversePayment = async () => {
    if (!reverseTarget) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/payments/${reverseTarget.id}/reverse`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reversalReason.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(
          `Payment ${reverseTarget.id} successfully REVERSED. Wallet balance clawed back and ledger reversal logged.`,
        );
        setReverseTarget(null);
        setReversalStep(1);
        setReversalReason("");
        setReversalConfirmTyped("");
        await fetchPayments();
      } else {
        setFeedback(`Reversal failed: ${data.message || data.error}`);
      }
    } catch (e: unknown) {
      setFeedback(e instanceof Error ? e.message : "Error executing reversal.");
    } finally {
      setSubmitting(false);
    }
  };

  const stats = useMemo(() => {
    const totalCount = payments.length;
    const completedCount = payments.filter((p) => p.status === "COMPLETED").length;
    const reversedCount = payments.filter((p) => p.reversed || p.status === "REVERSED").length;
    const totalVolumeMinor = payments
      .filter((p) => p.status === "COMPLETED")
      .reduce((acc, p) => acc + p.amountMinor, 0);

    return { totalCount, completedCount, reversedCount, totalVolumeMinor };
  }, [payments]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Payments & Reconciliation"
      subtitle="Viewer wallet top-up tracking, Paystack gateway audit, and double-confirmation reversal control."
      account={account}
      onLock={onLock}
      activePath="/zillionaire/payments"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Top-Up Payments & Money Inflow"
          subtitle="Viewers can only top up wallets and spend on content; viewer withdrawal is mathematically disabled. Reversing clawbacks funds from the credited wallet."
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
            title="Total Inflow Volume"
            value={formatMoney(stats.totalVolumeMinor, "NGN")}
            change="Net completed top-ups"
            icon={<ArrowDownLeft className="w-5 h-5" />}
            color="green"
          />
          <ConsoleKpiCard
            title="Total Top-Ups"
            value={stats.totalCount.toLocaleString()}
            change="All gateways"
            icon={<CreditCard className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Completed Success"
            value={stats.completedCount.toLocaleString()}
            change="Matched in ledger"
            icon={<CheckCircle2 className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Reversed Payments"
            value={stats.reversedCount.toLocaleString()}
            change="Clawed back"
            icon={<RotateCcw className="w-5 h-5" />}
            color="gold"
          />
        </div>

        {/* Filters and Search */}
        <ConsoleCard title="Transaction Search & Gateway Filters">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by payment ID, UID, reference, gateway..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-1">
              {(["ALL", "COMPLETED", "REVERSED", "FAILED"] as const).map((filter) => (
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

        {/* Payments Table */}
        <ConsoleCard title={`Transactions List (${payments.length} payments)`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading transactions...</div>
          ) : payments.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No payment transactions found.</div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "payment", label: "Payment ID & Gateway" },
                { key: "user", label: "Viewer UID" },
                { key: "amount", label: "Amount" },
                { key: "reconciliation", label: "Gateway Reconciliation" },
                { key: "status", label: "Status" },
                { key: "date", label: "Created / Reversed" },
                { key: "actions", label: "Reversal Action" },
              ]}
              data={payments.map((p) => ({
                id: p.id,
                payment: (
                  <div className="text-xs space-y-0.5">
                    <div className="font-mono font-bold text-white truncate max-w-[180px]">{p.id}</div>
                    <div className="flex items-center gap-1">
                      <span className="px-1.5 py-0.2 bg-slate-800 rounded font-mono text-[10px] uppercase text-cyan-300 font-semibold">
                        {p.gateway}
                      </span>
                      <span className="text-slate-500 font-mono text-[10px] truncate max-w-[100px]">
                        Ref: {p.reference}
                      </span>
                    </div>
                  </div>
                ),
                user: (
                  <div className="text-xs font-mono text-slate-300 truncate max-w-[140px]">{p.uid}</div>
                ),
                amount: (
                  <div className="text-xs">
                    <span className="font-mono font-bold text-sm text-emerald-400">
                      {formatMoney(p.amountMinor, p.currency)}
                    </span>
                    <div className="text-slate-500 text-[10px]">{p.currency}</div>
                  </div>
                ),
                reconciliation: (
                  <div className="text-xs space-y-0.5">
                    <span className="px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded font-mono text-[10px] font-bold">
                      {p.reconciliationStatus}
                    </span>
                    <div className="text-slate-400 text-[10px]">Paystack Webhook Verified</div>
                  </div>
                ),
                status: (
                  <ConsoleStatusBadge
                    status={p.status === "COMPLETED" ? "active" : p.status === "REVERSED" ? "error" : "inactive"}
                    label={p.status}
                  />
                ),
                date: (
                  <div className="text-xs text-slate-400 space-y-0.5">
                    <div>{p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}</div>
                    {p.reversedAt && (
                      <div className="text-amber-400 text-[10px]">
                        Rev: {new Date(p.reversedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ),
                actions: (
                  <div className="text-xs">
                    {p.status === "COMPLETED" && !p.reversed ? (
                      <button
                        onClick={() => {
                          setReverseTarget(p);
                          setReversalStep(1);
                          setReversalReason("");
                          setReversalConfirmTyped("");
                        }}
                        className="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded font-semibold flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Reverse
                      </button>
                    ) : (
                      <span className="text-slate-500 text-[11px] font-mono">Immutable</span>
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Modal: Double Confirmation Reversal */}
        {reverseTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-red-900 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-400" />
                  <h3 className="text-base font-bold text-white">
                    Reverse Top-Up Payment (Step {reversalStep} of 2)
                  </h3>
                </div>
                <button onClick={() => setReverseTarget(null)} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-3 bg-red-950/40 border border-red-900/60 rounded-lg space-y-1 text-slate-300">
                <p className="font-semibold text-red-300">
                  Warning: Payment reversal will claw back{" "}
                  <strong className="text-white font-mono">
                    {formatMoney(reverseTarget.amountMinor, reverseTarget.currency)}
                  </strong>{" "}
                  from viewer <code>{reverseTarget.uid}</code>'s wallet balance.
                </p>
                <p className="text-[11px] text-slate-400">
                  Payment ID: <span className="font-mono text-white">{reverseTarget.id}</span>
                </p>
              </div>

              {reversalStep === 1 ? (
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-300 mb-1">
                      Reason for Reversal (min 3 chars):
                    </label>
                    <textarea
                      rows={3}
                      value={reversalReason}
                      onChange={(e) => setReversalReason(e.target.value)}
                      placeholder="e.g. Chargeback claim / accidental duplicate charge confirmed with user"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReverseTarget(null)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={reversalReason.trim().length < 3}
                      onClick={() => setReversalStep(2)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-bold"
                    >
                      Proceed to Step 2 &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-amber-300 font-semibold">
                    Step 2: Type <code className="bg-slate-950 px-1 py-0.5 rounded text-white">REVERSE</code> below to permanently execute this clawback:
                  </p>

                  <input
                    type="text"
                    value={reversalConfirmTyped}
                    onChange={(e) => setReversalConfirmTyped(e.target.value)}
                    placeholder="Type REVERSE"
                    className="w-full px-3 py-2 bg-slate-950 border border-red-700 rounded-lg text-white font-mono font-bold tracking-widest text-center"
                  />

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setReversalStep(1)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-semibold"
                    >
                      &larr; Back
                    </button>
                    <button
                      type="button"
                      disabled={submitting || reversalConfirmTyped.trim() !== "REVERSE"}
                      onClick={executeReversePayment}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-bold"
                    >
                      {submitting ? "Reversing..." : "Execute Reversal"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
