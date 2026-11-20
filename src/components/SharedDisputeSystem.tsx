import React, { useState, type FormEvent } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  CornerDownRight,
  DollarSign,
  FileCheck,
  FilePlus,
  FileText,
  Filter,
  Inbox,
  LoaderCircle,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  ShieldAlert,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
} from "lucide-react";

export type DisputeStatus = "open" | "under_review" | "resolved" | "rejected";

export type DisputeMessage = {
  sender: "provider" | "producer" | "platform";
  senderUid?: string;
  text: string;
  timestamp: string;
};

export type DisputeResolution = {
  decision: "accept" | "reject" | "counter_offer";
  acceptedAmountMinor: number;
  adjustmentStatementPeriod: string;
  resolutionNotes: string;
  resolvedAt: string;
  resolvedByUid?: string;
};

export type DisputeItem = {
  id: string;
  subject: string;
  category: string;
  statementId: string | null;
  channelId?: string | null;
  claimedAmountMinor: number;
  claimedAmountCurrency: string;
  evidenceFileName: string | null;
  status: DisputeStatus;
  createdAt: string;
  updatedAt: string;
  messages: DisputeMessage[];
  resolution?: DisputeResolution | null;
};

export interface SharedDisputeSystemProps {
  mode: "producer" | "provider" | "zillionaire" | "admin";
  disputes: DisputeItem[];
  onCreateDispute: (data: {
    subject: string;
    category: string;
    statementId: string;
    claimedAmountMinor: number;
    claimedAmountCurrency: string;
    evidenceFileName?: string;
    message: string;
  }) => Promise<void>;
  onSendReply: (disputeId: string, message: string) => Promise<void>;
  onResolveDispute?: (
    disputeId: string,
    decision: "accept" | "reject" | "counter_offer",
    acceptedAmountMinor: number,
    adjustmentPeriod: string,
    resolutionNotes: string,
  ) => Promise<void>;
  isLoading?: boolean;
}

export function SharedDisputeSystem({
  mode,
  disputes,
  onCreateDispute,
  onSendReply,
  onResolveDispute,
  isLoading = false,
}: SharedDisputeSystemProps) {
  // Filter tabs
  const [activeFilter, setActiveFilter] = useState<"all" | DisputeStatus>("all");

  // Selected dispute thread
  const [selectedDisputeId, setSelectedDisputeId] = useState<string | null>(
    disputes[0]?.id || null,
  );

  // New dispute modal / state
  const [showNewModal, setShowNewModal] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("Revenue Share Calculation");
  const [statementId, setStatementId] = useState("");
  const [claimedAmountStr, setClaimedAmountStr] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [evidenceFileName, setEvidenceFileName] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reply message
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);

  // Operations resolution controls modal
  const [decisionType, setDecisionType] = useState<"accept" | "reject" | "counter_offer" | null>(
    null,
  );
  const [acceptedAmountStr, setAcceptedAmountStr] = useState("");
  const [adjustmentPeriod, setAdjustmentPeriod] = useState("April 2026 Statement");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolvingBusy, setResolvingBusy] = useState(false);

  // Filtered list
  const filteredDisputes = disputes.filter((d) => {
    if (activeFilter === "all") return true;
    return d.status === activeFilter;
  });

  const activeDispute = disputes.find((d) => d.id === selectedDisputeId) || disputes[0] || null;

  function formatMoney(minor: number, curr: string) {
    const symbol = curr === "NGN" ? "₦ " : "$ ";
    return `${symbol}${(minor / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function getStatusBadge(status: DisputeStatus) {
    switch (status) {
      case "resolved":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Resolved
          </span>
        );
      case "under_review":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-bold text-cyan-300">
            <Clock className="h-3 w-3" />
            Under Review
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/20 px-2.5 py-0.5 text-[10px] font-bold text-rose-300">
            <X className="h-3 w-3" />
            Rejected
          </span>
        );
      case "open":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
            <Clock className="h-3 w-3" />
            Open
          </span>
        );
    }
  }

  async function handleCreateDispute(e: FormEvent) {
    e.preventDefault();
    if (!subject || !description) return;
    setSubmitting(true);
    try {
      const claimedMinor = Math.round(parseFloat(claimedAmountStr || "0") * 100);
      await onCreateDispute({
        subject,
        category,
        statementId,
        claimedAmountMinor: isNaN(claimedMinor) ? 0 : claimedMinor,
        claimedAmountCurrency: currency,
        evidenceFileName: evidenceFileName || undefined,
        message: description,
      });
      setShowNewModal(false);
      setSubject("");
      setDescription("");
      setClaimedAmountStr("");
      setEvidenceFileName(null);
    } catch {
      // error handled upstream
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendReplyClick() {
    if (!activeDispute || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await onSendReply(activeDispute.id, replyText.trim());
      setReplyText("");
    } finally {
      setSendingReply(false);
    }
  }

  async function handleExecuteDecision(e: FormEvent) {
    e.preventDefault();
    if (!activeDispute || !decisionType || !onResolveDispute) return;
    setResolvingBusy(true);
    try {
      const acceptedMinor = Math.round(parseFloat(acceptedAmountStr || "0") * 100);
      await onResolveDispute(
        activeDispute.id,
        decisionType,
        isNaN(acceptedMinor) ? 0 : acceptedMinor,
        adjustmentPeriod,
        resolutionNotes,
      );
      setDecisionType(null);
      setResolutionNotes("");
      setAcceptedAmountStr("");
    } finally {
      setResolvingBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-cyan-400" />
            Dispute Management & Settlement Resolution
          </h2>
          <p className="text-xs text-slate-400">
            Direct dispute filing, chronological message threads, and formal adjustment settlements
          </p>
        </div>

        <div className="flex items-center gap-3">
          {mode !== "admin" && mode !== "zillionaire" && (
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 shadow-md shadow-cyan-400/20"
            >
              <Plus className="h-4 w-4" />
              <span>File New Dispute</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "All Disputes" },
            { id: "open", label: "Open" },
            { id: "under_review", label: "Under Review" },
            { id: "resolved", label: "Resolved" },
            { id: "rejected", label: "Rejected" },
          ] as const
        ).map((tab) => {
          const count =
            tab.id === "all" ? disputes.length : disputes.filter((d) => d.status === tab.id).length;
          const isActive = activeFilter === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                isActive
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/30"
                  : "bg-white/5 text-slate-400 hover:text-white border border-transparent"
              }`}
            >
              <span>{tab.label}</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-mono">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Dispute Workspace: List on left, Thread on right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Dispute List */}
        <div className="lg:col-span-5 space-y-3">
          {filteredDisputes.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-8 text-center text-slate-400 space-y-2">
              <Inbox className="h-8 w-8 mx-auto text-slate-500" />
              <p className="text-xs font-semibold">No disputes in this filter</p>
            </div>
          ) : (
            filteredDisputes.map((item) => {
              const isSelected = activeDispute?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedDisputeId(item.id)}
                  className={`cursor-pointer rounded-2xl border p-4 transition ${
                    isSelected
                      ? "border-cyan-400/50 bg-[#0a1e54] shadow-lg shadow-cyan-500/10"
                      : "border-white/10 bg-[#07143d] hover:border-white/20 hover:bg-[#07143d]/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <span className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                        {item.category}
                      </span>
                      <h4 className="text-sm font-bold text-white line-clamp-1">{item.subject}</h4>
                    </div>
                    {getStatusBadge(item.status)}
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono text-[11px]">
                      Claim:{" "}
                      <strong className="text-slate-200">
                        {formatMoney(item.claimedAmountMinor, item.claimedAmountCurrency)}
                      </strong>
                    </span>
                    <span className="text-[10px]">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right: Active Dispute Thread & Resolution */}
        <div className="lg:col-span-7">
          {activeDispute ? (
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-6 shadow-xl space-y-6">
              {/* Header Info */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">{activeDispute.subject}</h3>
                    {getStatusBadge(activeDispute.status)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Dispute ID: <span className="font-mono text-cyan-300">{activeDispute.id}</span>
                    {activeDispute.statementId && (
                      <>
                        {" "}
                        • Statement:{" "}
                        <span className="font-mono text-slate-300">{activeDispute.statementId}</span>
                      </>
                    )}
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Claimed Amount
                  </span>
                  <span className="font-mono text-sm font-bold text-white">
                    {formatMoney(activeDispute.claimedAmountMinor, activeDispute.claimedAmountCurrency)}
                  </span>
                </div>
              </div>

              {/* Evidence Attachment Badge */}
              {activeDispute.evidenceFileName && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#030b2a] px-3 py-2 text-xs text-slate-300">
                  <Paperclip className="h-4 w-4 text-cyan-400" />
                  <span>Attached Evidence:</span>
                  <span className="font-mono text-cyan-300 font-bold">
                    {activeDispute.evidenceFileName}
                  </span>
                </div>
              )}

              {/* Resolution Card (if resolved or countered) */}
              {activeDispute.resolution && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-5 w-5 text-emerald-400" />
                      <h4 className="text-sm font-bold text-emerald-300">
                        Formal Dispute Settlement Resolution
                      </h4>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
                      {activeDispute.resolution.decision}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Accepted Adjustment Amount:
                      </span>
                      <p className="mt-0.5 text-base font-mono font-bold text-emerald-400">
                        {formatMoney(
                          activeDispute.resolution.acceptedAmountMinor,
                          activeDispute.claimedAmountCurrency,
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400">
                        Applied Statement Period:
                      </span>
                      <p className="mt-0.5 font-semibold text-white">
                        {activeDispute.resolution.adjustmentStatementPeriod}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/5 bg-black/30 p-3 text-xs text-slate-300">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                      Operations Resolution Notes:
                    </span>
                    {activeDispute.resolution.resolutionNotes}
                  </div>
                </div>
              )}

              {/* Operations Decision Controls Banner */}
              {(mode === "admin" || mode === "zillionaire") && activeDispute.status !== "resolved" && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                      <ShieldAlert className="h-4 w-4" />
                      Operations Operations Decision Controls
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setDecisionType("accept");
                        setAcceptedAmountStr(
                          (activeDispute.claimedAmountMinor / 100).toFixed(2),
                        );
                        setResolutionNotes("Claim reviewed and approved in full.");
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-emerald-400"
                    >
                      <ThumbsUp className="h-3.5 w-3.5" />
                      Accept Claim
                    </button>
                    <button
                      onClick={() => {
                        setDecisionType("counter_offer");
                        setAcceptedAmountStr(
                          (activeDispute.claimedAmountMinor / 200).toFixed(2),
                        );
                        setResolutionNotes("Proposed 50% settlement credit based on edge log review.");
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 py-1.5 text-xs font-bold text-black hover:bg-cyan-400"
                    >
                      <DollarSign className="h-3.5 w-3.5" />
                      Counter-Offer
                    </button>
                    <button
                      onClick={() => {
                        setDecisionType("reject");
                        setAcceptedAmountStr("0.00");
                        setResolutionNotes("Deductible validated per master contract SLA parameters.");
                      }}
                      className="flex items-center gap-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 px-3.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-500/30"
                    >
                      <ThumbsDown className="h-3.5 w-3.5" />
                      Reject Claim
                    </button>
                  </div>
                </div>
              )}

              {/* Chronological Message Thread */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Chronological Discussion History
                </h4>
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {activeDispute.messages.map((msg, idx) => {
                    const isPlatform = msg.sender === "platform";
                    return (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-3.5 text-xs space-y-1.5 ${
                          isPlatform
                            ? "border-cyan-500/30 bg-[#030b2a] ml-4"
                            : "border-white/10 bg-black/40 mr-4"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold ${
                              isPlatform ? "text-cyan-300" : "text-white"
                            }`}
                          >
                            {isPlatform
                              ? "BQ SQWAD TV Operations Team"
                              : mode === "provider"
                                ? "Your Provider Organisation"
                                : "Producer Studio"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {new Date(msg.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-slate-300 whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Thread Reply Input Box */}
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendReplyClick();
                      }
                    }}
                    placeholder="Write a message to operations..."
                    className="flex-1 rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={handleSendReplyClick}
                    disabled={sendingReply || !replyText.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                  >
                    {sendingReply ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    <span>Send</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-[#07143d] p-12 text-center text-slate-400">
              Select a dispute to view the conversation and settlement status.
            </div>
          )}
        </div>
      </div>

      {/* MODAL: FILE NEW DISPUTE */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-cyan-400" />
                File Formal Settlement Dispute
              </h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDispute} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">Dispute Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white"
                >
                  <option value="Revenue Share Calculation">Revenue Share Calculation</option>
                  <option value="Deductible Costs Discrepancy">Deductible Costs Discrepancy</option>
                  <option value="SLA Downtime Penalty">SLA Downtime Penalty</option>
                  <option value="CDN Bandwidth Metrics">CDN Bandwidth Metrics</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Discrepancy in CDN deductible on March Statement"
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">Statement ID</label>
                  <input
                    type="text"
                    value={statementId}
                    onChange={(e) => setStatementId(e.target.value)}
                    placeholder="stmt_prov_2026_03"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-300 uppercase mb-1">Claimed Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={claimedAmountStr}
                    onChange={(e) => setClaimedAmountStr(e.target.value)}
                    placeholder="350.00"
                    className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Evidence File Attachment
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id="evidence-file-input"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setEvidenceFileName(e.target.files[0].name);
                      }
                    }}
                  />
                  <label
                    htmlFor="evidence-file-input"
                    className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-[#030b2a] px-3 py-1.5 text-slate-300 hover:text-white"
                  >
                    <Paperclip className="h-4 w-4" />
                    <span>Attach Evidence File</span>
                  </label>
                  {evidenceFileName && (
                    <span className="font-mono text-cyan-300 text-[11px] truncate max-w-xs">
                      {evidenceFileName}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Detailed Claim Description
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide timestamps, exact calculation discrepancy, and requested adjustment..."
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-cyan-400 px-5 py-2 font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                >
                  {submitting ? "Submitting…" : "File Dispute"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: OPERATIONS DECISION MODAL */}
      {decisionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl border border-white/15 bg-[#07143d] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-base font-bold text-white capitalize">
                Execute Decision: {decisionType.replace("_", " ")}
              </h3>
              <button
                onClick={() => setDecisionType(null)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteDecision} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Accepted Amount ({activeDispute?.claimedAmountCurrency || "USD"})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={acceptedAmountStr}
                  onChange={(e) => setAcceptedAmountStr(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Adjustment Statement Period
                </label>
                <input
                  type="text"
                  required
                  value={adjustmentPeriod}
                  onChange={(e) => setAdjustmentPeriod(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-300 uppercase mb-1">
                  Resolution Notes & Audit Justification
                </label>
                <textarea
                  required
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="State the basis for this decision for legal and audit compliance..."
                  className="w-full rounded-xl border border-white/10 bg-[#030b2a] px-3.5 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setDecisionType(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resolvingBusy}
                  className="rounded-xl bg-cyan-400 px-5 py-2 font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                >
                  {resolvingBusy ? "Processing…" : "Confirm Decision"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
