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
  Receipt,
  Search,
  X,
  Download,
  Mail,
  ExternalLink,
  PlusCircle,
  FileCheck2,
  AlertCircle,
  DollarSign,
  CreditCard,
  Send,
  User,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/receipts")({
  component: ZillionaireReceiptsRoute,
  head: () => ({
    meta: [
      { title: "Receipts & Money Documents | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ReceiptItem {
  id: string;
  receiptNumber: string;
  uid: string;
  customerEmail: string;
  customerName: string;
  type: "topup" | "charge" | "refund" | "payout";
  amountMinor: number;
  currency: string;
  paymentReference: string;
  paymentProvider: string;
  status: string;
  createdAt: string | null;
  sentCount: number;
}

function formatMinor(minor: number, currency: string = "NGN"): string {
  const symbol = currency === "NGN" ? "₦" : "$";
  return `${symbol}${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ZillionaireReceiptsRoute() {
  return (
    <ConsolePageGuard
      role="admin"
      module="finance"
      title="Receipts & Financial Documents"
      description="Sequential money documents, receipts, proof of payout, and customer lifetime spend."
    >
      {(token, account, onLock) => (
        <ZillionaireReceiptsPage token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireReceiptsPage({
  account,
  onLock,
}: {
  token: string | null;
  account: { uid: string; email?: string; roles?: string[]; modules?: string[]; isOwner?: boolean } | null;
  onLock?: () => void;
}) {
  const [receipts, setReceipts] = useState<ReceiptItem[]>([]);
  const [metrics, setMetrics] = useState<{ totalReceipts: number; totalVolumeMinor: number; targetUserSpendMinor: number }>({
    totalReceipts: 0,
    totalVolumeMinor: 0,
    targetUserSpendMinor: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "topup" | "charge" | "refund" | "payout">("ALL");

  // Selected receipt detail view
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);

  // Status message
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Issue manual receipt modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueUid, setIssueUid] = useState("");
  const [issueType, setIssueType] = useState<"topup" | "charge" | "refund" | "payout">("topup");
  const [issueAmountMajor, setIssueAmountMajor] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [issuing, setIssuing] = useState(false);

  const fetchReceipts = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders();
      const q = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(`/api/public/v1/zillionaire/receipts/${q}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setReceipts(data.receipts || []);
        if (data.metrics) setMetrics(data.metrics);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, [searchQuery]);

  const handleResendReceipt = async (receiptId: string) => {
    setResendingId(receiptId);
    setActionNotice(null);
    try {
      const headers = await getWebAuthHeaders();
      const res = await fetch(`/api/public/v1/zillionaire/receipts/${receiptId}/resend`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Receipt #${data.receiptNumber} successfully resent to ${data.sentTo} (Dispatch count: ${data.sentCount}).`);
        await fetchReceipts();
      } else {
        setActionNotice(`Failed to resend receipt: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : "Error resending receipt.");
    } finally {
      setResendingId(null);
    }
  };

  const handleCreateReceipt = async () => {
    if (!issueUid.trim() || !issueAmountMajor || Number(issueAmountMajor) <= 0 || !issueDescription.trim()) return;
    setIssuing(true);
    setActionNotice(null);
    try {
      const headers = await getWebAuthHeaders();
      const amountMinor = Math.round(Number(issueAmountMajor) * 100);
      const res = await fetch("/api/public/v1/zillionaire/receipts/", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: issueUid.trim(),
          type: issueType,
          amountMinor,
          description: issueDescription.trim(),
          currency: "NGN",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionNotice(`Sequential receipt #${data.receipt.receiptNumber} created and recorded.`);
        setShowIssueModal(false);
        setIssueUid("");
        setIssueAmountMajor("");
        setIssueDescription("");
        await fetchReceipts();
      } else {
        setActionNotice(`Failed to issue receipt: ${data.message || data.error}`);
      }
    } catch (err: unknown) {
      setActionNotice(err instanceof Error ? err.message : "Error creating receipt.");
    } finally {
      setIssuing(false);
    }
  };

  const filtered = useMemo(() => {
    return receipts.filter((r) => {
      if (typeFilter === "ALL") return true;
      return r.type === typeFilter;
    });
  }, [receipts, typeFilter]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Receipts & Financial Documents"
      subtitle="Sequential, unique, tamper-evident financial receipts for top-ups, charges, refunds and payouts"
      account={account}
      onLock={onLock}
      activePath="/zillionaire/receipts"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Financial Receipts Registry"
          subtitle="Generate, review, resend and download official PDF receipts. Track customer lifetime spend and audit records."
        />

        {/* Action feedback */}
        {actionNotice && (
          <div className="p-3 bg-cyan-950/60 border border-cyan-800 rounded-lg text-cyan-200 text-xs flex items-center justify-between">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} className="text-cyan-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Receipts"
            value={metrics.totalReceipts.toLocaleString()}
            change="Sequential index"
            icon={<Receipt className="w-5 h-5" />}
            color="blue"
          />
          <ConsoleKpiCard
            title="Total Volume Issued"
            value={formatMinor(metrics.totalVolumeMinor)}
            change="Gross ledger documented"
            icon={<DollarSign className="w-5 h-5" />}
            color="green"
          />
          <ConsoleKpiCard
            title="Top-up Documents"
            value={receipts.filter((r) => r.type === "topup").length.toString()}
            change="Paystack verified"
            icon={<CreditCard className="w-5 h-5" />}
            color="purple"
          />
          <ConsoleKpiCard
            title="Payout Proofs"
            value={receipts.filter((r) => r.type === "payout").length.toString()}
            change="Producer / Partner"
            icon={<FileCheck2 className="w-5 h-5" />}
            color="gold"
          />
        </div>

        {/* Search & Actions Bar */}
        <ConsoleCard title="Receipt Search & Generator">
          <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by receipt # (BQ-REC-...), email, payment reference..."
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex gap-2 w-full md:w-auto overflow-x-auto">
              {(["ALL", "topup", "charge", "refund", "payout"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors uppercase ${
                    typeFilter === t
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {t}
                </button>
              ))}

              <button
                onClick={() => setShowIssueModal(true)}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Receipt</span>
              </button>
            </div>
          </div>
        </ConsoleCard>

        {/* Receipts Table */}
        <ConsoleCard title={`Sequential Receipts (${filtered.length})`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading receipt records...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No receipts match your query.</div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "receiptNumber", label: "Receipt #" },
                { key: "customer", label: "Customer" },
                { key: "type", label: "Document Type" },
                { key: "amount", label: "Amount" },
                { key: "reference", label: "Payment Ref" },
                { key: "date", label: "Issued Date" },
                { key: "actions", label: "Actions" },
              ]}
              data={filtered.map((r) => ({
                id: r.id,
                receiptNumber: (
                  <span className="font-mono font-bold text-cyan-400 text-xs">
                    {r.receiptNumber}
                  </span>
                ),
                customer: (
                  <div>
                    <div className="font-medium text-white text-xs">{r.customerName}</div>
                    <div className="text-slate-400 text-[11px]">{r.customerEmail}</div>
                  </div>
                ),
                type: (
                  <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700">
                    {r.type}
                  </span>
                ),
                amount: (
                  <span className="font-bold text-white text-xs">
                    {formatMinor(r.amountMinor, r.currency)}
                  </span>
                ),
                reference: (
                  <span className="font-mono text-slate-400 text-[11px]">
                    {r.paymentReference}
                  </span>
                ),
                date: (
                  <span className="text-xs text-slate-400">
                    {r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}
                  </span>
                ),
                actions: (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelectedReceipt(r)}
                      className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-medium"
                    >
                      Inspect
                    </button>
                    <a
                      href={`/api/public/v1/zillionaire/receipts/${r.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 bg-cyan-950 hover:bg-cyan-900 border border-cyan-800 text-cyan-300 rounded"
                      title="Download PDF / Print Document"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      disabled={resendingId === r.id}
                      onClick={() => handleResendReceipt(r.id)}
                      className="p-1 bg-blue-950 hover:bg-blue-900 border border-blue-800 text-blue-300 rounded disabled:opacity-50"
                      title="Resend to Customer Email"
                    >
                      <Mail className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* Receipt Detail Modal */}
        {selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-base font-bold text-white font-mono">
                    {selectedReceipt.receiptNumber}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedReceipt(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer Name:</span>
                    <span className="text-white font-medium">{selectedReceipt.customerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer Email:</span>
                    <span className="text-white font-medium">{selectedReceipt.customerEmail}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Customer UID:</span>
                    <span className="font-mono text-slate-300 text-[11px]">{selectedReceipt.uid}</span>
                  </div>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Document Type:</span>
                    <span className="text-cyan-400 uppercase font-mono font-bold">{selectedReceipt.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Amount:</span>
                    <span className="text-white font-bold text-sm">
                      {formatMinor(selectedReceipt.amountMinor, selectedReceipt.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Payment Reference:</span>
                    <span className="font-mono text-slate-300">{selectedReceipt.paymentReference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Provider:</span>
                    <span className="text-slate-300">{selectedReceipt.paymentProvider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Issued At:</span>
                    <span className="text-slate-300">
                      {selectedReceipt.createdAt ? new Date(selectedReceipt.createdAt).toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Email Dispatches:</span>
                    <span className="text-emerald-400 font-semibold">{selectedReceipt.sentCount} sent</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <a
                  href={`/api/public/v1/zillionaire/receipts/${selectedReceipt.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download / Print Receipt</span>
                </a>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleResendReceipt(selectedReceipt.id)}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-bold flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Resend Email</span>
                  </button>
                  <button
                    onClick={() => setSelectedReceipt(null)}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Issue Manual Receipt Modal */}
        {showIssueModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-emerald-400" />
                  Issue Financial Receipt
                </h3>
                <button onClick={() => setShowIssueModal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Customer User ID</label>
                  <input
                    type="text"
                    value={issueUid}
                    onChange={(e) => setIssueUid(e.target.value)}
                    placeholder="Enter viewer UID..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Receipt Type</label>
                  <select
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="topup">Wallet Top-up (BQ-REC-...)</option>
                    <option value="charge">Playback Charge (BQ-REC-...)</option>
                    <option value="refund">Refund Document (BQ-REF-...)</option>
                    <option value="payout">Producer / Partner Payout (BQ-PAY-...)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Amount (NGN)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={issueAmountMajor}
                    onChange={(e) => setIssueAmountMajor(e.target.value)}
                    placeholder="e.g. 2500"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Description</label>
                  <input
                    type="text"
                    value={issueDescription}
                    onChange={(e) => setIssueDescription(e.target.value)}
                    placeholder="e.g. Manual top-up credit adjustment"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    issuing ||
                    !issueUid.trim() ||
                    !issueAmountMajor ||
                    Number(issueAmountMajor) <= 0 ||
                    !issueDescription.trim()
                  }
                  onClick={handleCreateReceipt}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-bold"
                >
                  {issuing ? "Generating..." : "Generate Sequential Receipt"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
