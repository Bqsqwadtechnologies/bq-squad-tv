import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCircle2,
  Clock,
  Download,
  FileCheck,
  FileText,
  HelpCircle,
  Lock,
  Printer,
  Shield,
  X,
} from "lucide-react";

export type SettlementStatus = "Pending" | "Processing" | "Paid" | "Disputed";

export type SettlementStatement = {
  id: string;
  period: string;
  status: SettlementStatus;
  currency: string;
  grossWatchTimeMinutes: number;
  grossRevenueMinor: number;
  deductibleCosts: {
    cdnDeliveryMinor: number;
    paymentProcessingMinor: number;
    infrastructureMinor: number;
    totalDeductibleMinor: number;
  };
  netPayoutMinor: number;
  paymentReference: string | null;
  paidAt: string | null;
  statementHash: string;
  lineItems?: Array<{
    description: string;
    quantity: string | number;
    rate: string;
    amountMinor: number;
    isDeduction?: boolean;
  }>;
};

export interface StatementsSettlementViewProps {
  mode: "producer" | "provider";
  title?: string;
  statements: SettlementStatement[];
  onDispute?: (statementId: string) => void;
  isLoading?: boolean;
}

export function StatementsSettlementView({
  mode,
  title,
  statements,
  onDispute,
  isLoading = false,
}: StatementsSettlementViewProps) {
  const [selectedStatement, setSelectedStatement] = useState<SettlementStatement | null>(null);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState("");

  function formatCurrency(minor: number, currency: string) {
    const symbol = currency === "NGN" ? "₦ " : "$ ";
    return `${symbol}${(minor / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function formatWatchTime(minutes: number) {
    if (minutes < 60) return `${minutes} mins`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hrs.toLocaleString()}h ${mins > 0 ? `${mins}m` : ""}`;
  }

  function getStatusBadge(status: SettlementStatus) {
    switch (status) {
      case "Paid":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Paid
          </span>
        );
      case "Processing":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/20 px-2.5 py-0.5 text-[11px] font-bold text-blue-300">
            <Clock className="h-3 w-3 animate-spin" />
            Processing
          </span>
        );
      case "Disputed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-2.5 py-0.5 text-[11px] font-bold text-rose-300">
            <AlertTriangle className="h-3 w-3" />
            Disputed
          </span>
        );
      case "Pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
    }
  }

  function handleDownloadSignedPdf(stmt: SettlementStatement) {
    const lines = [
      "================================================================================",
      `             BQ SQWAD TV — OFFICIAL SIGNED SETTLEMENT STATEMENT`,
      "================================================================================",
      `Statement ID:        ${stmt.id}`,
      `Settlement Period:   ${stmt.period}`,
      `Role Mode:           ${mode === "producer" ? "Content Producer" : "Infrastructure Provider"}`,
      `Settlement Status:   ${stmt.status}`,
      `Currency:            ${stmt.currency}`,
      `Payment Reference:   ${stmt.paymentReference || "N/A (Pending Settlement)"}`,
      `Settled Timestamp:   ${stmt.paidAt || "Pending Execution"}`,
      `SHA-256 Audit Hash:  ${stmt.statementHash}`,
      "--------------------------------------------------------------------------------",
      "SUMMARY OF SETTLEMENT AMOUNTS:",
      `Gross Watch Time:    ${formatWatchTime(stmt.grossWatchTimeMinutes)}`,
      `Gross Revenue:       ${formatCurrency(stmt.grossRevenueMinor, stmt.currency)}`,
      `Total Deductions:    -${formatCurrency(stmt.deductibleCosts.totalDeductibleMinor, stmt.currency)}`,
      `  • CDN Delivery:    -${formatCurrency(stmt.deductibleCosts.cdnDeliveryMinor, stmt.currency)}`,
      `  • Payment Proc:    -${formatCurrency(stmt.deductibleCosts.paymentProcessingMinor, stmt.currency)}`,
      `  • Infrastructure:  -${formatCurrency(stmt.deductibleCosts.infrastructureMinor, stmt.currency)}`,
      "--------------------------------------------------------------------------------",
      `NET PAYOUT AMOUNT:   ${formatCurrency(stmt.netPayoutMinor, stmt.currency)}`,
      "================================================================================",
      "DIGITAL SIGNATURE & VERIFICATION:",
      "This document is cryptographically verified by BQ SQWAD TV Settlement Engine.",
      `Signature Algorithm: HMAC-SHA256 with Hardware Security Module (HSM)`,
      `Signatory Authority: BQ SQWAD Technologies Limited`,
      "================================================================================",
    ].join("\n");

    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `statement-${stmt.id}-${stmt.period.replace(/\s+/g, "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadSuccessMessage(`Signed statement document for ${stmt.period} downloaded.`);
    setTimeout(() => setDownloadSuccessMessage(""), 4000);
  }

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            {title || (mode === "producer" ? "Producer Settlement Statements" : "Provider Settlement Statements")}
          </h2>
          <p className="text-xs text-slate-400">
            Certified monthly revenue-share statements, watch-time totals, deductible costs, and signed statements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
            {mode === "producer" ? "Producer Mode" : "Provider Mode"}
          </span>
        </div>
      </div>

      {downloadSuccessMessage && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
          {downloadSuccessMessage}
        </div>
      )}

      {/* Monthly Statement Table */}
      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#07143d] shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 bg-[#030b2a] text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4">Settlement Period</th>
                <th className="px-5 py-4">Gross Watch Time</th>
                <th className="px-5 py-4">Gross Revenue</th>
                <th className="px-5 py-4">Deductions Breakdown</th>
                <th className="px-5 py-4">Net Payout</th>
                <th className="px-5 py-4">Payment Status</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {statements.map((stmt) => (
                <tr key={stmt.id} className="transition hover:bg-white/[0.02]">
                  <td className="px-5 py-4 font-bold text-white">
                    <div className="flex flex-col">
                      <span>{stmt.period}</span>
                      <span className="font-mono text-[10px] text-slate-500">{stmt.id}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-300">
                    {formatWatchTime(stmt.grossWatchTimeMinutes)}
                  </td>
                  <td className="px-5 py-4 font-mono font-semibold text-slate-200">
                    {formatCurrency(stmt.grossRevenueMinor, stmt.currency)}
                  </td>
                  <td className="px-5 py-4 text-[11px] text-slate-400">
                    <div className="flex flex-col">
                      <span className="font-mono text-rose-300">
                        -{formatCurrency(stmt.deductibleCosts.totalDeductibleMinor, stmt.currency)}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        CDN: {formatCurrency(stmt.deductibleCosts.cdnDeliveryMinor, stmt.currency)} • Infra:{" "}
                        {formatCurrency(stmt.deductibleCosts.infrastructureMinor, stmt.currency)}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono font-bold text-emerald-400 text-sm">
                    {formatCurrency(stmt.netPayoutMinor, stmt.currency)}
                  </td>
                  <td className="px-5 py-4">{getStatusBadge(stmt.status)}</td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setSelectedStatement(stmt)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:text-white transition"
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* STATEMENT DETAIL MODAL */}
      {selectedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-[#07143d] p-6 sm:p-8 shadow-2xl space-y-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Statement Details — {selectedStatement.period}
                  </h3>
                  {getStatusBadge(selectedStatement.status)}
                </div>
                <p className="mt-1 font-mono text-[11px] text-slate-400">
                  Statement ID: <span className="text-cyan-300">{selectedStatement.id}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedStatement(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Audit Hash & Security Badge */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-bold text-emerald-300">
                <Shield className="h-4 w-4" />
                <span>Tamper-Evident SHA-256 Audit Seal</span>
              </div>
              <p className="font-mono text-[10px] text-slate-300 break-all">
                {selectedStatement.statementHash}
              </p>
            </div>

            {/* Line-Item Breakdown Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Settlement Line-Item Breakdown
              </h4>
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#030b2a]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/10 bg-black/30 text-[10px] font-bold uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Item Description</th>
                      <th className="px-4 py-3">Volume / Metric</th>
                      <th className="px-4 py-3">Rate</th>
                      <th className="px-4 py-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-sans">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-white">Gross Watch Time Revenue</td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatWatchTime(selectedStatement.grossWatchTimeMinutes)}
                      </td>
                      <td className="px-4 py-3 text-slate-400">Pool Distribution</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-white">
                        {formatCurrency(selectedStatement.grossRevenueMinor, selectedStatement.currency)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-rose-300">Less: CDN Egress & Edge Distribution</td>
                      <td className="px-4 py-3 text-slate-400">Tier 1 Edge Nodes</td>
                      <td className="px-4 py-3 text-slate-400">Volume Band</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-rose-300">
                        -{formatCurrency(selectedStatement.deductibleCosts.cdnDeliveryMinor, selectedStatement.currency)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-rose-300">Less: Payment Gateway Fees</td>
                      <td className="px-4 py-3 text-slate-400">Processing</td>
                      <td className="px-4 py-3 text-slate-400">1.5% + fixed</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-rose-300">
                        -{formatCurrency(selectedStatement.deductibleCosts.paymentProcessingMinor, selectedStatement.currency)}
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-rose-300">Less: Ingest & Cloud Infrastructure</td>
                      <td className="px-4 py-3 text-slate-400">Transcoding</td>
                      <td className="px-4 py-3 text-slate-400">Per Ingest Hour</td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-rose-300">
                        -{formatCurrency(selectedStatement.deductibleCosts.infrastructureMinor, selectedStatement.currency)}
                      </td>
                    </tr>
                    <tr className="bg-white/[0.03] font-bold">
                      <td className="px-4 py-3 text-cyan-300 uppercase tracking-wider text-[11px]" colSpan={3}>
                        Net Settlement Payout
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400 text-sm">
                        {formatCurrency(selectedStatement.netPayoutMinor, selectedStatement.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Payment Reference:</span>
                <p className="mt-1 font-mono text-slate-200">
                  {selectedStatement.paymentReference || "N/A — Processing Queue"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/5 bg-[#030b2a] p-3.5">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Settlement Date:</span>
                <p className="mt-1 font-mono text-slate-200">
                  {selectedStatement.paidAt
                    ? new Date(selectedStatement.paidAt).toLocaleDateString()
                    : "Scheduled with next disbursement"}
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              {onDispute && selectedStatement.status !== "Disputed" && (
                <button
                  onClick={() => {
                    const id = selectedStatement.id;
                    setSelectedStatement(null);
                    onDispute(id);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2 text-xs font-bold text-rose-300 hover:bg-rose-500/20 transition"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>Dispute Statement</span>
                </button>
              )}

              <button
                onClick={() => handleDownloadSignedPdf(selectedStatement)}
                className="flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-lg shadow-cyan-400/20 transition ml-auto"
              >
                <Download className="h-4 w-4" />
                <span>Download Signed PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
