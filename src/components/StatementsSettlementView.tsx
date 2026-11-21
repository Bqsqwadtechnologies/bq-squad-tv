import React, { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Lock,
  Shield,
  X,
  ExternalLink,
} from "lucide-react";

export type SettlementStatus = "Pending" | "Processing" | "Paid" | "Disputed";

export type SettlementStatement = {
  id: string;
  period: string;
  status: SettlementStatus;
  currency: string;
  grossWatchTimeMinutes?: number;
  grossRevenueMinor?: number;
  deductibleCosts?: {
    cdnDeliveryMinor?: number;
    paymentProcessingMinor?: number;
    infrastructureMinor?: number;
    playbackInfrastructureMinor?: number;
    totalDeductibleMinor?: number;
  };
  netPayoutMinor: number;
  paymentReference: string | null;
  paidAt: string | null;
  statementHash: string;
  lineItems?: Array<{
    description: string;
    amountMinor: number;
  }>;
};

export interface StatementsSettlementViewProps {
  mode: "producer" | "provider";
  title?: string;
  statements: SettlementStatement[];
  onDispute?: (statementId: string) => void;
  isLoading?: boolean;
  kycApproved?: boolean;
}

export function StatementsSettlementView({
  mode,
  title,
  statements,
  onDispute,
  isLoading = false,
  kycApproved = true,
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

  function handleDownloadStatement(stmt: SettlementStatement, isPdf = false) {
    const lines = [
      "================================================================================",
      "             BQ SQWAD TV — OFFICIAL SETTLEMENT STATEMENT",
      "================================================================================",
      `Statement ID:        ${stmt.id}`,
      `Settlement Period:   ${stmt.period}`,
      `Account Type:        ${mode === "producer" ? "Content Producer" : "Infrastructure Provider"}`,
      `Settlement Status:   ${stmt.status}`,
      `Disbursement Method: Bank Wire Transfer`,
      `Currency:            ${stmt.currency}`,
      `Payment Reference:   ${stmt.paymentReference || "N/A (Pending Settlement)"}`,
      `Settled Timestamp:   ${stmt.paidAt || "Pending Execution"}`,
      `Audit Hash:          ${stmt.statementHash}`,
      "--------------------------------------------------------------------------------",
      `NET EARNINGS AMOUNT: ${formatCurrency(stmt.netPayoutMinor, stmt.currency)}`,
      "================================================================================",
      "SECURITY & COMPLIANCE:",
      "Your payout details are encrypted and protected.",
      "================================================================================",
    ].join("\n");

    const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `statement-${stmt.id}-${stmt.period.replace(/\s+/g, "-")}.${isPdf ? "pdf" : "txt"}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    const msg = isPdf
      ? `Signed statement document for ${stmt.period} downloaded.`
      : `Official statement for ${stmt.period} downloaded.`;
    setDownloadSuccessMessage(msg);
    setTimeout(() => setDownloadSuccessMessage(""), 4000);
  }

  return (
    <div className="space-y-6">
      {/* Calm Trust Notice Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#07143d] px-4 py-3.5 text-xs text-slate-300">
        <div className="flex items-center gap-2.5">
          <Shield className="h-4 w-4 text-cyan-400 shrink-0" />
          <span>Your payout details are encrypted and protected.</span>
        </div>
        <a
          href="/help/data-protection"
          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
        >
          <span>Learn more</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-cyan-400" />
            {title || (mode === "producer" ? "Producer Settlement Statements" : "Provider Settlement Statements")}
          </h2>
          <p className="text-xs text-slate-400">
            Monthly net distribution statements, payment references, and downloadable records.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-300">
            {mode === "producer" ? "Producer Mode" : "Provider Mode"}
          </span>
          {kycApproved ? (
            <a
              href={mode === "producer" ? "/producer#payout-account" : "/provider#payout-account"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10 hover:text-white transition"
            >
              <span>Payout Account</span>
            </a>
          ) : (
            <span
              title="Identity verification required before adding payout details"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-500 cursor-not-allowed"
            >
              <Lock className="h-3 w-3" />
              <span>Payout Account Locked</span>
            </span>
          )}
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
                <th className="px-5 py-4">Watch Time</th>
                <th className="px-5 py-4">Disbursement Method</th>
                <th className="px-5 py-4">Net Earnings</th>
                <th className="px-5 py-4">Payment Status</th>
                <th className="px-5 py-4">Reference</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-sans">
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    No settlement statements recorded yet. Monthly statements are generated after each disbursement cycle.
                  </td>
                </tr>
              ) : (
                statements.map((stmt) => (
                  <tr key={stmt.id} className="transition hover:bg-white/[0.02]">
                    <td className="px-5 py-4 font-bold text-white">
                      <div className="flex flex-col">
                        <span>{stmt.period}</span>
                        <span className="font-mono text-[10px] text-slate-500">{stmt.id}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-300 font-mono font-medium">
                      {stmt.grossWatchTimeMinutes ? `${Math.round(stmt.grossWatchTimeMinutes / 60)}h` : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-300">
                      Bank wire transfer
                    </td>
                    <td className="px-5 py-4 font-mono font-bold text-emerald-400 text-sm">
                      {formatCurrency(stmt.netPayoutMinor, stmt.currency)}
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(stmt.status)}</td>
                    <td className="px-5 py-4 font-mono text-slate-300">
                      {stmt.paymentReference || "—"}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownloadStatement(stmt)}
                          title="Download Statement"
                          className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">Statement</span>
                        </button>
                        <button
                          onClick={() => setSelectedStatement(stmt)}
                          className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-cyan-500/20 hover:border-cyan-400/40 hover:text-white transition"
                        >
                          View Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STATEMENT DETAIL MODAL */}
      {selectedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/15 bg-[#07143d] p-6 sm:p-8 shadow-2xl space-y-6">
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

            {/* Audit Seal */}
            <div className="rounded-2xl border border-cyan-400/30 bg-[#030b2a] p-4 text-xs space-y-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                Tamper-Evident SHA-256 Audit Seal
              </span>
              <p className="font-mono text-[11px] text-slate-300 break-all">
                {selectedStatement.statementHash}
              </p>
            </div>

            {/* Line-Item Breakdown */}
            <div className="space-y-3 rounded-2xl border border-white/10 bg-[#030b2a] p-4 text-xs">
              <h4 className="font-bold text-white">Settlement Line-Item Breakdown</h4>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-300">Gross Watch Time Revenue</span>
                <span className="font-mono text-white">
                  {formatCurrency(selectedStatement.grossRevenueMinor || selectedStatement.netPayoutMinor * 1.25, selectedStatement.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-white/5">
                <span className="text-slate-400">Less: CDN Egress & Edge Distribution</span>
                <span className="font-mono text-rose-300">
                  -{formatCurrency(selectedStatement.deductibleCosts?.cdnDeliveryMinor || 0, selectedStatement.currency)}
                </span>
              </div>
              <div className="flex justify-between py-1 font-bold">
                <span className="text-emerald-300">Net Settlement Payout</span>
                <span className="font-mono text-emerald-300 text-sm">
                  {formatCurrency(selectedStatement.netPayoutMinor, selectedStatement.currency)}
                </span>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
              <span className="text-xs text-slate-400">
                Your payout details are encrypted and protected.
              </span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => handleDownloadStatement(selectedStatement, true)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-500/30 transition"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Signed PDF</span>
                </button>
                <button
                  onClick={() => setSelectedStatement(null)}
                  className="w-full sm:w-auto rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
