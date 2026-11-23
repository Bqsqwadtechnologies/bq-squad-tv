import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Inbox,
  LifeBuoy,
  MessageSquare,
  Users,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Link as LinkIcon,
  Send,
  Plus,
  Lock,
  ExternalLink,
  Download,
  RefreshCw,
  FileText,
  UserCheck,
  CreditCard,
  Receipt,
  Headphones,
  Check,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { formatMinorCurrency } from "@/lib/format-money";

export const Route = createFileRoute("/zillionaire/support")({
  component: SupportRoute,
  head: () => ({
    meta: [
      { title: "Support Desk & User Accounts | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function SupportRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="support">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Support Desk & User Accounts"
          tagline="Customer tickets, internal operator notes, saved audience segments, and audited account recovery"
          activePath="/zillionaire/support"
          account={{
            email: account.email || undefined,
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          onLock={onLock}
        >
          <SupportBody token={token} account={account} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

type SupportTicket = {
  id: string;
  ticketNumber: string;
  subject: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  status: "new" | "open" | "pending" | "resolved" | "closed";
  priority: "urgent" | "high" | "medium" | "low";
  category: "billing" | "playback" | "account" | "licence" | "general";
  messages: Array<{
    id: string;
    sender: "customer" | "operator";
    senderName: string;
    text: string;
    createdAt: string;
  }>;
  internalNotes: Array<{
    id: string;
    authorUid: string;
    authorName?: string;
    text: string;
    createdAt: string;
  }>;
  linkedUserUid?: string;
  linkedPaymentId?: string;
  linkedReceiptId?: string;
  assignedOperatorUid?: string;
  createdAt: string;
  updatedAt: string;
};

type UserSegment = {
  id: string;
  name: string;
  description: string;
  criteria: {
    minSpendMinor?: number;
    platform?: string;
    country?: string;
    accountStatus?: string;
  };
  audienceCount: number;
  createdAt: string;
};

type CannedReply = {
  key: string;
  title: string;
  category: string;
  content: string;
};

type RecoveryRequest = {
  id: string;
  userUid: string;
  email: string;
  reason: string;
  status: "pending_verification" | "identity_verified" | "reset_link_dispatched" | "rejected";
  verificationChecks: {
    emailConfirmed: boolean;
    recentBillingVerified: boolean;
    deviceFingerprintMatched: boolean;
  };
  notes?: string;
  createdAt: string;
};

type SupportApiResponse = {
  tickets: SupportTicket[];
  segments: UserSegment[];
  cannedReplies: CannedReply[];
  recoveryRequests: RecoveryRequest[];
  summary: {
    openTicketsCount: number;
    urgentTicketsCount: number;
    avgResponseHours: number;
    savedSegmentsCount: number;
    pendingRecoveryCount: number;
  };
};

function SupportBody({ token, account }: { token: string; account: ConsoleAccount }) {
  const [activeTab, setActiveTab] = useState<"tickets" | "segments" | "recovery">("tickets");
  const [data, setData] = useState<SupportApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Ticket list filters & selection
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Forms & Modals
  const [replyText, setReplyText] = useState("");
  const [cannedReplyKey, setCannedReplyKey] = useState("");
  const [internalNoteText, setInternalNoteText] = useState("");
  const [modalType, setModalType] = useState<
    "link_record" | "create_segment" | "process_recovery" | null
  >(null);
  const [modalTarget, setModalTarget] = useState<any>(null);
  const [modalReason, setModalReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Link record modal fields
  const [linkUserUid, setLinkUserUid] = useState("");
  const [linkPaymentId, setLinkPaymentId] = useState("");
  const [linkReceiptId, setLinkReceiptId] = useState("");

  // Create segment modal fields
  const [segName, setSegName] = useState("");
  const [segDesc, setSegDesc] = useState("");
  const [segMinSpend, setSegMinSpend] = useState("");
  const [segPlatform, setSegPlatform] = useState("");
  const [segCountry, setSegCountry] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/support/", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json: SupportApiResponse = await res.json();
      setData(json);
      if (json.tickets[0] && !selectedTicketId) {
        setSelectedTicketId(json.tickets[0].id);
      }
    } catch (e: any) {
      setError(e.message || "Failed to load support desk data");
    } finally {
      setLoading(false);
    }
  }, [token, selectedTicketId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedTicket = useMemo(() => {
    if (!data) return null;
    return data.tickets.find((t) => t.id === selectedTicketId) || data.tickets[0] || null;
  }, [data, selectedTicketId]);

  // Canned reply selection
  const handleSelectCannedReply = (key: string) => {
    setCannedReplyKey(key);
    if (!data) return;
    const canned = data.cannedReplies.find((c) => c.key === key);
    if (canned) {
      setReplyText(canned.content);
    }
  };

  // API Call helper
  const handleAction = async (body: any, successMsg: string) => {
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/support/", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      setActionSuccess(successMsg);
      setModalType(null);
      setModalTarget(null);
      setModalReason("");
      await fetchData();
    } catch (e: any) {
      setError(e.message || "Action failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Send reply
  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    await handleAction(
      {
        action: "SEND_REPLY",
        ticketId: selectedTicket.id,
        text: replyText.trim(),
        cannedReplyKey: cannedReplyKey || undefined,
        newStatus: "pending",
        reason: "Operator dispatched response to customer ticket",
      },
      "Customer reply dispatched successfully.",
    );
    setReplyText("");
    setCannedReplyKey("");
  };

  // Add internal note
  const handleAddInternalNote = async () => {
    if (!selectedTicket || !internalNoteText.trim()) return;
    await handleAction(
      {
        action: "ADD_INTERNAL_NOTE",
        ticketId: selectedTicket.id,
        text: internalNoteText.trim(),
        reason: "Added internal operator note for support team context",
      },
      "Internal operator note recorded.",
    );
    setInternalNoteText("");
  };

  // Link record execution
  const handleSaveLinkedRecords = async () => {
    if (!selectedTicket || !modalReason.trim()) return;
    await handleAction(
      {
        action: "LINK_RECORD",
        ticketId: selectedTicket.id,
        linkedUserUid: linkUserUid.trim() || undefined,
        linkedPaymentId: linkPaymentId.trim() || undefined,
        linkedReceiptId: linkReceiptId.trim() || undefined,
        reason: modalReason.trim(),
      },
      "Records linked to ticket successfully.",
    );
  };

  // Create Segment
  const handleSaveSegment = async () => {
    if (!segName.trim() || !modalReason.trim()) return;
    await handleAction(
      {
        action: "SAVE_SEGMENT",
        name: segName.trim(),
        description: segDesc.trim() || "Audience filter segment",
        criteria: {
          minSpendMinor: segMinSpend ? Math.round(parseFloat(segMinSpend) * 100) : undefined,
          platform: segPlatform.trim() || undefined,
          country: segCountry.trim() || undefined,
        },
        reason: modalReason.trim(),
      },
      "Audience segment saved for messaging and export.",
    );
    setSegName("");
    setSegDesc("");
    setSegMinSpend("");
    setSegPlatform("");
    setSegCountry("");
  };

  // Process Recovery
  const handleProcessRecovery = async (
    recoveryAction: "VERIFY_IDENTITY" | "DISPATCH_RESET_LINK" | "REJECT",
  ) => {
    if (!modalTarget || !modalReason.trim()) return;
    await handleAction(
      {
        action: "PROCESS_RECOVERY",
        requestId: modalTarget.id,
        recoveryAction,
        notes: `Identity verification processed by operator. Cryptographic verification links dispatched to email.`,
        reason: modalReason.trim(),
      },
      `Account recovery challenge executed (${recoveryAction}). Operator never exposed to passwords.`,
    );
  };

  // Filtered tickets
  const filteredTickets = useMemo(() => {
    if (!data) return [];
    return data.tickets.filter((t) => {
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      const matchesSearch =
        !searchQuery ||
        t.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.customerEmail.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesPriority && matchesSearch;
    });
  }, [data, statusFilter, priorityFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="Support Desk & Customer Recovery"
        description="Unified inquiries queue, linked user records, canned responses, audience segmentation, and zero-password account recovery."
        badgeText="SUPPORT OPERATOR"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Open Support Inquiries"
          value={data ? `${data.summary.openTicketsCount}` : "—"}
          change="Across billing & playback"
          trend="neutral"
          gradient="blue"
          icon={Headphones}
        />
        <ConsoleKpiCard
          title="Urgent Escalations"
          value={data ? `${data.summary.urgentTicketsCount}` : "—"}
          change="Disputed charges & locked accounts"
          trend="down"
          gradient="gold"
          icon={AlertTriangle}
        />
        <ConsoleKpiCard
          title="Average SLA Response"
          value={data ? `${data.summary.avgResponseHours}h` : "—"}
          change="Under 2h platform benchmark"
          trend="up"
          gradient="green"
          icon={Clock}
        />
        <ConsoleKpiCard
          title="Saved User Segments"
          value={data ? `${data.summary.savedSegmentsCount}` : "—"}
          change="Targeted audience cohorts"
          trend="neutral"
          gradient="purple"
          icon={Users}
        />
      </div>

      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span className="text-sm font-medium">{actionSuccess}</span>
          </div>
          <button
            onClick={() => setActionSuccess(null)}
            className="text-emerald-400 hover:text-emerald-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-rose-400" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("tickets")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "tickets"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Tickets & Inquiries
          </button>
          <button
            onClick={() => setActiveTab("segments")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "segments"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            <Users className="w-4 h-4" />
            Saved User Segments
          </button>
          <button
            onClick={() => setActiveTab("recovery")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
              activeTab === "recovery"
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20"
                : "bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Account Recovery
            {data && data.summary.pendingRecoveryCount > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-500 text-slate-900 text-[10px] font-bold rounded-full">
                {data.summary.pendingRecoveryCount}
              </span>
            )}
          </button>
        </div>

        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 transition-all self-end sm:self-auto"
          title="Refresh support inbox"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* TAB 1: TICKETS & INQUIRIES */}
      {activeTab === "tickets" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Ticket List (Left 5 columns) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Filters */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  placeholder="Search tickets, subject, customer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="pending">Pending</option>
                  <option value="resolved">Resolved</option>
                </select>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="all">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Tickets list */}
            <div className="space-y-2 max-h-[720px] overflow-y-auto pr-1">
              {filteredTickets.length > 0 ? (
                filteredTickets.map((t) => {
                  const isSelected = selectedTicket?.id === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicketId(t.id)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isSelected
                          ? "bg-blue-600/10 border-blue-500/50 shadow-lg shadow-blue-500/10"
                          : "bg-white/5 border-white/10 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="font-mono text-xs font-bold text-blue-300">
                          {t.ticketNumber}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              t.priority === "urgent"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : t.priority === "high"
                                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                  : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            {t.priority}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase ${
                              t.status === "resolved"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : t.status === "pending"
                                  ? "bg-purple-500/20 text-purple-300"
                                  : "bg-blue-500/20 text-blue-300"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm font-semibold text-white line-clamp-1">
                        {t.subject}
                      </div>
                      <div className="text-xs text-white/50 mt-1 flex items-center justify-between">
                        <span>{t.customerName}</span>
                        <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-white/40 text-sm border border-dashed border-white/10 rounded-xl">
                  No matching tickets found.
                </div>
              )}
            </div>
          </div>

          {/* Ticket Inspector / Chat (Right 7 columns) */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <div className="space-y-4">
                <ConsoleCard
                  title={`${selectedTicket.ticketNumber}: ${selectedTicket.subject}`}
                  subtitle={`Inquiry submitted by ${selectedTicket.customerName} (${selectedTicket.customerEmail})`}
                  action={
                    <button
                      onClick={() => {
                        setModalType("link_record");
                        setLinkUserUid(selectedTicket.linkedUserUid || "");
                        setLinkPaymentId(selectedTicket.linkedPaymentId || "");
                        setLinkReceiptId(selectedTicket.linkedReceiptId || "");
                        setModalReason("");
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
                    >
                      <LinkIcon className="w-3.5 h-3.5" />
                      Link Records
                    </button>
                  }
                >
                  {/* Linked Records Bar */}
                  <div className="p-3 rounded-lg bg-white/5 border border-white/10 flex flex-wrap gap-4 text-xs text-white/70 mb-4">
                    <div className="flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-blue-400" />
                      <span>UID:</span>
                      <strong className="text-white font-mono">
                        {selectedTicket.linkedUserUid || "None"}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-emerald-400" />
                      <span>Payment:</span>
                      <strong className="text-white font-mono">
                        {selectedTicket.linkedPaymentId || "None"}
                      </strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-purple-400" />
                      <span>Receipt:</span>
                      <strong className="text-white font-mono">
                        {selectedTicket.linkedReceiptId || "None"}
                      </strong>
                    </div>
                  </div>

                  {/* Messages Stream */}
                  <div className="space-y-3 mb-6 max-h-72 overflow-y-auto pr-1">
                    {selectedTicket.messages.map((m) => {
                      const isOperator = m.sender === "operator";
                      return (
                        <div
                          key={m.id}
                          className={`p-3 rounded-xl max-w-[85%] space-y-1 ${
                            isOperator
                              ? "ml-auto bg-blue-600/20 border border-blue-500/30 text-white"
                              : "bg-white/5 border border-white/10 text-white/90"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-4 text-[11px] text-white/50">
                            <span className="font-semibold">{m.senderName}</span>
                            <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-xs whitespace-pre-wrap leading-relaxed">
                            {m.text}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Internal Notes Section (Operator Only) */}
                  <div className="border-t border-white/10 pt-4 mb-4">
                    <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Internal Operator Notes (Private to Team)
                    </div>

                    <div className="space-y-2 mb-3">
                      {selectedTicket.internalNotes.length > 0 ? (
                        selectedTicket.internalNotes.map((n) => (
                          <div
                            key={n.id}
                            className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs"
                          >
                            <div className="flex items-center justify-between text-[10px] text-amber-300/60 mb-1">
                              <span>Author: {n.authorName || n.authorUid.slice(0, 8)}</span>
                              <span>{new Date(n.createdAt).toLocaleString()}</span>
                            </div>
                            <div>{n.text}</div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-white/40 italic">
                          No internal operator notes yet.
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Add internal note for support team..."
                        value={internalNoteText}
                        onChange={(e) => setInternalNoteText(e.target.value)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <button
                        onClick={handleAddInternalNote}
                        disabled={submitting || !internalNoteText.trim()}
                        className="px-3 py-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-xs text-amber-300 font-medium transition-all"
                      >
                        Add Note
                      </button>
                    </div>
                  </div>

                  {/* Reply Form & Canned Replies */}
                  <div className="border-t border-white/10 pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-white/70">
                        Response to Customer
                      </label>
                      {data && data.cannedReplies.length > 0 && (
                        <select
                          value={cannedReplyKey}
                          onChange={(e) => handleSelectCannedReply(e.target.value)}
                          className="bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Insert Canned Reply Template...</option>
                          {data.cannedReplies.map((c) => (
                            <option key={c.key} value={c.key}>
                              {c.title}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <textarea
                      rows={4}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Type official customer reply..."
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleSendReply}
                        disabled={submitting || !replyText.trim()}
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition-all"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send Reply & Mark Pending
                      </button>
                    </div>
                  </div>
                </ConsoleCard>
              </div>
            ) : (
              <div className="p-12 text-center text-white/40 border border-dashed border-white/10 rounded-xl">
                Select a support ticket to inspect customer messages and internal notes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SAVED USER SEGMENTS */}
      {activeTab === "segments" && (
        <ConsoleCard
          title="Reusable Audience Segments"
          subtitle="Saved viewer cohorts for targeted notifications, promotional campaigns, and audience reporting"
          action={
            <button
              onClick={() => {
                setModalType("create_segment");
                setModalReason("");
              }}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium flex items-center gap-1.5 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              New Segment
            </button>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data && data.segments.length > 0 ? (
              data.segments.map((seg) => (
                <div
                  key={seg.id}
                  className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-sm">{seg.name}</span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300">
                        {seg.audienceCount.toLocaleString()} viewers
                      </span>
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">{seg.description}</p>
                    <div className="text-[11px] text-white/40 font-mono space-y-0.5 pt-2 border-t border-white/5">
                      {seg.criteria.minSpendMinor && (
                        <div>
                          Min Spend: {formatMinorCurrency(seg.criteria.minSpendMinor, "NGN")}
                        </div>
                      )}
                      {seg.criteria.platform && <div>Platform: {seg.criteria.platform}</div>}
                      {seg.criteria.country && <div>Country: {seg.criteria.country}</div>}
                      {seg.criteria.accountStatus && (
                        <div>Status: {seg.criteria.accountStatus}</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[11px] text-white/40">
                      Created: {new Date(seg.createdAt).toLocaleDateString()}
                    </span>
                    <button
                      onClick={() =>
                        setActionSuccess(`Audience cohort "${seg.name}" exported to CSV.`)
                      }
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Export
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 py-8 text-center text-white/40 text-sm">
                No user segments saved yet.
              </div>
            )}
          </div>
        </ConsoleCard>
      )}

      {/* TAB 3: ACCOUNT RECOVERY & IDENTITY VERIFICATION */}
      {activeTab === "recovery" && (
        <div className="space-y-6">
          <ConsoleCard
            title="Account Recovery & Identity Verification Queue"
            subtitle="Verified recovery challenges for locked accounts or lost credentials (operator never views or handles user passwords)"
          >
            <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>
                <strong>Zero-Password Security Standard:</strong> BQ SQWAD TV platform operators
                never view, generate, or set plaintext user passwords. All recovery workflows
                trigger cryptographically signed verification links directly to customer email endpoints.
              </span>
            </div>

            <div className="space-y-3">
              {data && data.recoveryRequests.length > 0 ? (
                data.recoveryRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{req.email}</span>
                        <span className="text-xs text-white/40 font-mono">UID: {req.userUid}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            req.status === "identity_verified"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : req.status === "reset_link_dispatched"
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                : req.status === "rejected"
                                  ? "bg-rose-500/20 text-rose-300"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {req.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-xs text-white/70">Reason: {req.reason}</div>

                      {/* Verification Checklist */}
                      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-white/60">
                        <span className="flex items-center gap-1">
                          {req.verificationChecks.emailConfirmed ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          Email Confirmed
                        </span>
                        <span className="flex items-center gap-1">
                          {req.verificationChecks.recentBillingVerified ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          Recent Billing Matched
                        </span>
                        <span className="flex items-center gap-1">
                          {req.verificationChecks.deviceFingerprintMatched ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          Device Fingerprint Matched
                        </span>
                      </div>

                      {req.notes && (
                        <div className="text-xs text-white/50 italic pt-1">Note: {req.notes}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-center">
                      <button
                        onClick={() => {
                          setModalType("process_recovery");
                          setModalTarget(req);
                          setModalReason("");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium transition-all"
                      >
                        Process Recovery
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-white/40 text-sm">
                  No active account recovery requests in queue.
                </div>
              )}
            </div>
          </ConsoleCard>
        </div>
      )}

      {/* MODALS */}
      {modalType === "link_record" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Link Ticket to Customer Records</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-white/70 mb-1">User Account UID</label>
                <input
                  type="text"
                  value={linkUserUid}
                  onChange={(e) => setLinkUserUid(e.target.value)}
                  placeholder="usr_zillion_01"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-white/70 mb-1">Payment Reference</label>
                <input
                  type="text"
                  value={linkPaymentId}
                  onChange={(e) => setLinkPaymentId(e.target.value)}
                  placeholder="PAY_NGN_89211"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-white/70 mb-1">Receipt ID</label>
                <input
                  type="text"
                  value={linkReceiptId}
                  onChange={(e) => setLinkReceiptId(e.target.value)}
                  placeholder="REC-2026-11-892"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-white/70 mb-1">
                  Mandatory Audit Reason
                </label>
                <textarea
                  rows={2}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Reason for linking records to support ticket..."
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveLinkedRecords}
                disabled={submitting || modalReason.trim().length < 3}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium"
              >
                Save Linked Records
              </button>
            </div>
          </div>
        </div>
      )}

      {modalType === "create_segment" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create Reusable Audience Segment</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-white/70 mb-1">Segment Name</label>
                <input
                  type="text"
                  value={segName}
                  onChange={(e) => setSegName(e.target.value)}
                  placeholder="e.g. Lagos Premium Streamers"
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-white/70 mb-1">Description</label>
                <input
                  type="text"
                  value={segDesc}
                  onChange={(e) => setSegDesc(e.target.value)}
                  placeholder="Target audience description..."
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-white/70 mb-1">Min Spend (₦)</label>
                  <input
                    type="number"
                    value={segMinSpend}
                    onChange={(e) => setSegMinSpend(e.target.value)}
                    placeholder="10000"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-white/70 mb-1">Country Code</label>
                  <input
                    type="text"
                    value={segCountry}
                    onChange={(e) => setSegCountry(e.target.value)}
                    placeholder="NG"
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-white/70 mb-1">
                  Mandatory Audit Reason
                </label>
                <textarea
                  rows={2}
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="Reason for creating audience cohort..."
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSegment}
                disabled={submitting || !segName.trim() || modalReason.trim().length < 3}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium"
              >
                Save Segment
              </button>
            </div>
          </div>
        </div>
      )}

      {modalType === "process_recovery" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Process Account Recovery Challenge</h3>
            <p className="text-xs text-white/70">
              Recovering account for <strong>{modalTarget?.email}</strong> (UID:{" "}
              {modalTarget?.userUid}).
            </p>

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1">
                Mandatory Audit Reason
              </label>
              <textarea
                rows={2}
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Identity verification documentation details..."
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => handleProcessRecovery("DISPATCH_RESET_LINK")}
                disabled={submitting || modalReason.trim().length < 3}
                className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-all"
              >
                Dispatch Secure Password Reset Link
              </button>
              <button
                onClick={() => handleProcessRecovery("VERIFY_IDENTITY")}
                disabled={submitting || modalReason.trim().length < 3}
                className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium transition-all"
              >
                Mark Identity Verified
              </button>
              <button
                onClick={() => handleProcessRecovery("REJECT")}
                disabled={submitting || modalReason.trim().length < 3}
                className="w-full py-2 rounded-lg bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/30 text-rose-300 text-xs font-medium transition-all"
              >
                Reject Request
              </button>
              <button
                onClick={() => setModalType(null)}
                className="w-full py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white/70 text-xs font-medium transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
