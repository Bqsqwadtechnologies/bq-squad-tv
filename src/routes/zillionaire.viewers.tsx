import { useState, useEffect, useMemo, FormEvent } from "react";
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
  Users,
  Search,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  UserX,
  UserCheck,
  X,
  KeyRound,
  History,
  Activity,
  Lock,
  Wallet,
  Receipt,
  Tv,
  Smartphone,
  MessageSquare,
  FileText,
  Mail,
  Send,
  PlusCircle,
  MinusCircle,
  RotateCcw,
  LogOut,
  Globe,
  Trash2,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { requestZillionaireStepUp } from "@/lib/zillionaire-step-up";

export const Route = createFileRoute("/zillionaire/viewers")({
  component: ZillionaireViewersRoute,
  head: () => ({
    meta: [
      { title: "Viewer 360 | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ViewerAccount {
  id: string;
  email: string;
  displayName: string;
  username?: string | null;
  phone?: string | null;
  walletId?: string | null;
  accountStatus: string;
  suspended: boolean;
  createdAt: string | null;
  roleTags: string[];
  riskScore: number;
}

interface UserProfileDetails {
  profile: {
    id: string;
    email: string;
    displayName: string;
    phone: string | null;
    country: string;
    createdAt: string | null;
    accountStatus: string;
    emailVerified: boolean;
    parentalPinConfigured: boolean;
    riskScore: number;
    authRevocationTime: string | null;
  };
  wallet: {
    balanceMinor: number;
    currency: string;
    ledger: Array<{
      id: string;
      kind: string;
      description: string;
      amountMinor: number;
      balanceAfterMinor: number;
      createdAt: string | null;
      reference: string | null;
    }>;
  };
  payments: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    reference: string;
    createdAt: string | null;
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    amountMinor: number;
    currency: string;
    type: string;
    createdAt: string | null;
  }>;
  watchHistory: Array<{
    id: string;
    videoId: string;
    title: string;
    watchedSeconds: number;
    createdAt: string | null;
  }>;
  devices: Array<{
    id: string;
    deviceModel: string;
    platform: string;
    ipPrefix: string;
    lastActiveAt: string | null;
    revoked: boolean;
  }>;
  comments: Array<{
    id: string;
    videoId: string;
    text: string;
    createdAt: string | null;
    hidden: boolean;
  }>;
  notes: Array<{
    id: string;
    text: string;
    authorUid: string;
    createdAt: string | null;
  }>;
}

type TabType =
  | "profile"
  | "wallet"
  | "payments"
  | "receipts"
  | "watchHistory"
  | "devices"
  | "comments"
  | "security"
  | "notes";

function formatMinor(minor: number, currency: string = "NGN"): string {
  const symbol = currency === "NGN" ? "₦" : "$";
  return `${symbol}${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function ZillionaireViewersRoute() {
  return (
    <ConsolePageGuard
      role="zillionaire"
      module="users"
      title="Viewer 360"
      description="Find and manage viewers, accounts, wallets, receipts and security"
    >
      {({ token, account, onLock }) => (
        <ZillionaireViewersPage token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireViewersPage({
  token,
  account,
  onLock,
}: {
  token: string;
  account: {
    uid: string;
    email?: string | null;
    roles?: string[];
    modules?: string[];
    isOwner?: boolean;
  } | null;
  onLock?: () => void;
}) {
  const [users, setUsers] = useState<ViewerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "SUSPENDED" | "RESTRICTED" | "BANNED"
  >("ALL");

  // Selected User State for Viewer 360 Detail Modal/Drawer
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [userDetails, setUserDetails] = useState<UserProfileDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("profile");

  // Action Modals State
  const [actionReason, setActionReason] = useState("");
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionPayload, setActionPayload] = useState<Record<string, unknown>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Send Message Modal
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageChannel, setMessageChannel] = useState<"in_app" | "email" | "both">("in_app");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("custom");

  // Wallet adjustment modal
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletAdjustType, setWalletAdjustType] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [walletAmountMajor, setWalletAmountMajor] = useState<string>("");

  const templates = [
    { id: "custom", name: "Custom Message", subject: "", body: "" },
    {
      id: "warning",
      name: "Community Warning",
      subject: "Important notice regarding your BQ SQWAD TV account",
      body: "We have noticed activity on your account that does not comply with our Community Standards. Please review our guidelines to avoid service interruption.",
    },
    {
      id: "credit",
      name: "Wallet Courtesy Credit",
      subject: "Courtesy credit applied to your wallet",
      body: "We have credited your wallet as a courtesy. You can now use your balance for watching live streams and premium titles.",
    },
    {
      id: "security",
      name: "Security Alert",
      subject: "Security check required on your account",
      body: "For your protection, please verify your recent account activity and consider updating your security settings.",
    },
  ];

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const headers = await getWebAuthHeaders(token);
      const queryParam = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(`/api/public/v1/zillionaire/users/${queryParam}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchQuery]);

  const loadUserDetails = async (uid: string) => {
    setSelectedUid(uid);
    setLoadingDetails(true);
    setUserDetails(null);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/users/${uid}/`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUserDetails(data);
      }
    } catch {
      // fallback
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleExecuteAction = async (payloadOverride?: Record<string, unknown>) => {
    if (!selectedUid) return;
    const finalPayload = payloadOverride || {
      action: pendingAction,
      reason: actionReason,
      ...actionPayload,
    };
    setSubmittingAction(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const sensitiveScope =
        finalPayload["action"] === "wallet_adjust"
          ? "wallet_adjust"
          : finalPayload["action"] === "reverse_payment"
            ? "payment_reversal"
            : finalPayload["action"] === "delete_or_anonymize"
              ? "permanent_delete"
              : null;
      const headers = sensitiveScope
        ? await requestZillionaireStepUp(
            sensitiveScope,
            String(finalPayload["reason"] || "Sensitive owner action"),
          )
        : await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/users/${selectedUid}/`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(finalPayload),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.message || data.error || "Action failed.");
      } else {
        setActionSuccess("Action completed successfully and logged to immutable audit.");
        setPendingAction(null);
        setActionReason("");
        setActionPayload({});
        // Reload details and list
        await loadUserDetails(selectedUid);
        await fetchUsers();
      }
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmittingAction(false);
    }
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter === "ALL") return true;
      if (statusFilter === "ACTIVE") return u.accountStatus === "ACTIVE" && !u.suspended;
      if (statusFilter === "SUSPENDED") return u.suspended || u.accountStatus === "SUSPENDED";
      if (statusFilter === "RESTRICTED") return u.accountStatus === "RESTRICTED";
      if (statusFilter === "BANNED") return u.accountStatus === "BANNED";
      return true;
    });
  }, [users, statusFilter]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.accountStatus === "ACTIVE" && !u.suspended).length;
    const suspended = users.filter((u) => u.suspended || u.accountStatus === "SUSPENDED").length;
    const highRisk = users.filter((u) => u.riskScore >= 70).length;
    return { total, active, suspended, highRisk };
  }, [users]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Viewer 360"
      subtitle="Find any user instantly by email, ID, phone, wallet, or device"
      account={account}
      onLock={onLock}
      activePath="/zillionaire/viewers"
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Viewer 360 Intelligence"
          subtitle="Direct owner oversight of all viewer accounts, wallets, receipts, sessions, and security controls."
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Viewers"
            value={stats.total.toLocaleString()}
            caption="Indexed viewer accounts"
            icon={<Users className="w-5 h-5" />}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Active & Healthy"
            value={stats.active.toLocaleString()}
            caption="Active status"
            icon={<CheckCircle2 className="w-5 h-5" />}
            variant="green"
          />
          <ConsoleKpiCard
            title="Suspended / Blocked"
            value={stats.suspended.toLocaleString()}
            caption="Access denied"
            icon={<UserX className="w-5 h-5" />}
            variant="purple"
          />
          <ConsoleKpiCard
            title="Elevated Risk Score"
            value={stats.highRisk.toLocaleString()}
            caption="Flagged for security review"
            icon={<AlertTriangle className="w-5 h-5" />}
            variant="gold"
          />
        </div>

        {/* Search & Filters */}
        <ConsoleCard title="Instant User Search">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by @username, email, user ID, display name, phone, wallet ID or device ID..."
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
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["ALL", "ACTIVE", "SUSPENDED", "RESTRICTED", "BANNED"] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    statusFilter === st
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
        </ConsoleCard>

        {/* Viewers Table */}
        <ConsoleCard title={`Found Viewers (${filteredUsers.length})`}>
          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading user registry...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No viewers match the search query or selected filter.
            </div>
          ) : (
            <ConsoleTable
              columns={[
                { key: "displayName", label: "Viewer Name" },
                { key: "username", label: "Username" },
                { key: "email", label: "Email / Identifier" },
                { key: "accountStatus", label: "Status" },
                { key: "riskScore", label: "Risk Score" },
                { key: "createdAt", label: "Registered" },
                { key: "actions", label: "Action" },
              ]}
              data={filteredUsers.map((u) => ({
                id: u.id,
                displayName: (
                  <div className="font-medium text-white flex items-center gap-2">
                    <span>{u.displayName}</span>
                    {u.roleTags?.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ),
                username: (
                  <span className="font-mono text-xs text-cyan-300">{u.username ? "@" + u.username : "—"}</span>
                ),
                email: (
                  <div>
                    <div className="text-white text-xs">{u.email || "No email"}</div>
                    <div className="text-slate-500 text-[10px] font-mono">{u.id}</div>
                  </div>
                ),
                accountStatus: (
                  <ConsoleStatusBadge
                    status={
                      u.accountStatus === "BANNED"
                        ? "error"
                        : u.suspended || u.accountStatus === "SUSPENDED"
                          ? "warning"
                          : u.accountStatus === "RESTRICTED"
                            ? "warning"
                            : "active"
                    }
                    label={u.accountStatus}
                  />
                ),
                riskScore: (
                  <span
                    className={`font-semibold text-xs ${
                      u.riskScore >= 70
                        ? "text-red-400"
                        : u.riskScore >= 40
                          ? "text-amber-400"
                          : "text-emerald-400"
                    }`}
                  >
                    {u.riskScore} / 100
                  </span>
                ),
                createdAt: (
                  <span className="text-xs text-slate-400">
                    {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                  </span>
                ),
                actions: (
                  <button
                    onClick={() => loadUserDetails(u.id)}
                    className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium transition-colors"
                  >
                    Inspect 360
                  </button>
                ),
              }))}
            />
          )}
        </ConsoleCard>

        {/* User 360 Detail Modal */}
        {selectedUid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400 font-bold">
                    {userDetails?.profile.displayName.substring(0, 2).toUpperCase() || "V"}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      {userDetails?.profile.displayName || "Viewer Details"}
                      {userDetails && (
                        <ConsoleStatusBadge
                          status={
                            userDetails.profile.accountStatus === "BANNED"
                              ? "error"
                              : userDetails.profile.accountStatus === "SUSPENDED"
                                ? "warning"
                                : "active"
                          }
                          label={userDetails.profile.accountStatus}
                        />
                      )}
                    </h2>
                    <p className="text-xs text-slate-400 font-mono">{selectedUid}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedUid(null)}
                  className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Tabs */}
              <div className="flex gap-1 px-6 pt-3 border-b border-slate-800 bg-slate-950 overflow-x-auto text-xs font-semibold">
                {(
                  [
                    { id: "profile", label: "Profile", icon: Users },
                    { id: "wallet", label: "Wallet & Ledger", icon: Wallet },
                    { id: "payments", label: "Payments", icon: Activity },
                    { id: "receipts", label: "Receipts", icon: Receipt },
                    { id: "watchHistory", label: "Watch History", icon: Tv },
                    { id: "devices", label: "Devices & Sessions", icon: Smartphone },
                    { id: "comments", label: "Comments", icon: MessageSquare },
                    { id: "security", label: "Security & PIN", icon: KeyRound },
                    { id: "notes", label: "Notes", icon: FileText },
                  ] as const
                ).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 px-3 py-2 border-b-2 transition-colors whitespace-nowrap ${
                        isActive
                          ? "border-cyan-400 text-cyan-300 bg-slate-900/60"
                          : "border-transparent text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingDetails ? (
                  <div className="py-12 text-center text-slate-400">
                    Loading complete viewer 360 data...
                  </div>
                ) : !userDetails ? (
                  <div className="py-12 text-center text-red-400">Failed to load viewer data.</div>
                ) : (
                  <>
                    {/* Action Feedback alerts */}
                    {actionError && (
                      <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-300 text-xs flex items-center justify-between">
                        <span>{actionError}</span>
                        <button
                          onClick={() => setActionError(null)}
                          className="text-red-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {actionSuccess && (
                      <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-lg text-emerald-300 text-xs flex items-center justify-between">
                        <span>{actionSuccess}</span>
                        <button
                          onClick={() => setActionSuccess(null)}
                          className="text-emerald-400 hover:text-white"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* Quick Action Bar for the User */}
                    <div className="flex flex-wrap gap-2 p-3 bg-slate-950 border border-slate-800 rounded-lg items-center justify-between">
                      <div className="text-xs font-semibold text-slate-300">Quick Actions:</div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setShowMessageModal(true);
                            setMessageSubject("");
                            setMessageBody("");
                          }}
                          className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Send Message</span>
                        </button>

                        <button
                          onClick={() => {
                            setShowWalletModal(true);
                            setWalletAmountMajor("");
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Adjust Balance</span>
                        </button>

                        {userDetails.profile.accountStatus === "ACTIVE" ? (
                          <button
                            onClick={() => {
                              setPendingAction("status");
                              setActionPayload({ status: "SUSPENDED" });
                            }}
                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center gap-1"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            <span>Suspend</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setPendingAction("status");
                              setActionPayload({ status: "ACTIVE" });
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            <span>Unsuspend</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setPendingAction("force_signout_all");
                            setActionPayload({});
                          }}
                          className="px-2.5 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Sign-out Everywhere</span>
                        </button>

                        <button
                          onClick={() => {
                            setPendingAction("status");
                            setActionPayload({ status: "BANNED" });
                          }}
                          className="px-2.5 py-1.5 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Ban</span>
                        </button>
                      </div>
                    </div>

                    {/* TAB 1: Profile */}
                    {activeTab === "profile" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                          <h3 className="font-bold text-slate-300 text-sm">Account Overview</h3>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Display Name:</span>
                            <span className="text-white font-medium">
                              {userDetails.profile.displayName}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Email:</span>
                            <span className="text-white font-medium flex items-center gap-1">
                              {userDetails.profile.email || "—"}
                              {userDetails.profile.emailVerified ? (
                                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800">
                                  Verified
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-800">
                                  Unverified
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Phone:</span>
                            <span className="text-white font-medium">
                              {userDetails.profile.phone || "—"}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Country:</span>
                            <span className="text-white font-medium">
                              {userDetails.profile.country}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Registration Date:</span>
                            <span className="text-white font-medium">
                              {userDetails.profile.createdAt
                                ? new Date(userDetails.profile.createdAt).toLocaleString()
                                : "—"}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-3">
                          <h3 className="font-bold text-slate-300 text-sm">
                            Security & Integrity State
                          </h3>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Risk Score:</span>
                            <span
                              className={`font-bold ${
                                userDetails.profile.riskScore >= 70
                                  ? "text-red-400"
                                  : userDetails.profile.riskScore >= 40
                                    ? "text-amber-400"
                                    : "text-emerald-400"
                              }`}
                            >
                              {userDetails.profile.riskScore} / 100
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Parental PIN:</span>
                            <span className="text-white font-medium">
                              {userDetails.profile.parentalPinConfigured
                                ? "Configured (Active)"
                                : "None"}
                            </span>
                          </div>
                          <div className="flex justify-between border-b border-slate-800/80 pb-2">
                            <span className="text-slate-400">Global Revocation Cutoff:</span>
                            <span className="text-white font-mono text-[11px]">
                              {userDetails.profile.authRevocationTime
                                ? new Date(userDetails.profile.authRevocationTime).toLocaleString()
                                : "No active revocation"}
                            </span>
                          </div>
                          <div className="pt-2 flex gap-2">
                            <button
                              onClick={() => {
                                setPendingAction("delete_or_anonymize");
                                setActionPayload({ mode: "anonymize" });
                              }}
                              className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 rounded text-xs"
                            >
                              Anonymize Account
                            </button>
                            <button
                              onClick={() => {
                                setPendingAction("delete_or_anonymize");
                                setActionPayload({ mode: "soft_delete" });
                              }}
                              className="px-3 py-1.5 bg-red-950 hover:bg-red-900 border border-red-800 text-red-200 rounded text-xs"
                            >
                              Soft Delete (30d purge)
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: Wallet & Ledger */}
                    {activeTab === "wallet" && (
                      <div className="space-y-4 text-xs">
                        <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between">
                          <div>
                            <span className="text-slate-400 text-xs">Current Wallet Balance</span>
                            <div className="text-2xl font-bold text-white mt-1">
                              {formatMinor(
                                userDetails.wallet.balanceMinor,
                                userDetails.wallet.currency,
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">
                              Currency: {userDetails.wallet.currency}
                            </span>
                          </div>
                          <button
                            onClick={() => {
                              setShowWalletModal(true);
                              setWalletAmountMajor("");
                            }}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg text-xs"
                          >
                            Adjust Balance (+ / -)
                          </button>
                        </div>

                        <div>
                          <h4 className="font-bold text-slate-300 mb-2">
                            Immutable Ledger Entries
                          </h4>
                          {userDetails.wallet.ledger.length === 0 ? (
                            <div className="p-4 bg-slate-950 border border-slate-800 rounded text-center text-slate-500">
                              No ledger entries recorded yet.
                            </div>
                          ) : (
                            <div className="overflow-x-auto border border-slate-800 rounded-lg">
                              <table className="w-full text-left">
                                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                  <tr>
                                    <th className="p-2.5">Date</th>
                                    <th className="p-2.5">Kind</th>
                                    <th className="p-2.5">Description</th>
                                    <th className="p-2.5">Amount</th>
                                    <th className="p-2.5">Balance After</th>
                                    <th className="p-2.5">Ref</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                                  {userDetails.wallet.ledger.map((e) => (
                                    <tr key={e.id}>
                                      <td className="p-2.5 text-slate-400">
                                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                                      </td>
                                      <td className="p-2.5 font-mono text-cyan-400">{e.kind}</td>
                                      <td className="p-2.5 text-slate-200">{e.description}</td>
                                      <td
                                        className={`p-2.5 font-bold ${
                                          e.amountMinor >= 0 ? "text-emerald-400" : "text-red-400"
                                        }`}
                                      >
                                        {formatMinor(e.amountMinor, userDetails.wallet.currency)}
                                      </td>
                                      <td className="p-2.5 text-slate-300">
                                        {formatMinor(
                                          e.balanceAfterMinor,
                                          userDetails.wallet.currency,
                                        )}
                                      </td>
                                      <td className="p-2.5 font-mono text-[11px] text-slate-500">
                                        {e.reference || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* TAB 3: Payments */}
                    {activeTab === "payments" && (
                      <div className="space-y-4 text-xs">
                        <h4 className="font-bold text-slate-300">Paystack & Card Top-ups</h4>
                        {userDetails.payments.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No payment transactions recorded.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            <table className="w-full text-left">
                              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">Date</th>
                                  <th className="p-2.5">Reference</th>
                                  <th className="p-2.5">Amount</th>
                                  <th className="p-2.5">Status</th>
                                  <th className="p-2.5">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                                {userDetails.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td className="p-2.5 text-slate-400">
                                      {p.createdAt ? new Date(p.createdAt).toLocaleString() : "—"}
                                    </td>
                                    <td className="p-2.5 font-mono text-cyan-400">{p.reference}</td>
                                    <td className="p-2.5 font-bold text-white">
                                      {formatMinor(p.amountMinor, p.currency)}
                                    </td>
                                    <td className="p-2.5">
                                      <ConsoleStatusBadge
                                        status={
                                          p.status === "SUCCESS"
                                            ? "active"
                                            : p.status === "REVERSED"
                                              ? "error"
                                              : "warning"
                                        }
                                        label={p.status}
                                      />
                                    </td>
                                    <td className="p-2.5">
                                      {p.status !== "REVERSED" ? (
                                        <button
                                          onClick={() => {
                                            setPendingAction("reverse_payment");
                                            setActionPayload({ paymentId: p.id });
                                          }}
                                          className="px-2.5 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[11px]"
                                        >
                                          Reverse Payment
                                        </button>
                                      ) : (
                                        <span className="text-slate-500 text-[11px]">Reversed</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 4: Receipts */}
                    {activeTab === "receipts" && (
                      <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-300">Generated Money Receipts</h4>
                        </div>
                        {userDetails.receipts.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No receipts issued for this user yet.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            <table className="w-full text-left">
                              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">Receipt #</th>
                                  <th className="p-2.5">Type</th>
                                  <th className="p-2.5">Amount</th>
                                  <th className="p-2.5">Date</th>
                                  <th className="p-2.5">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                                {userDetails.receipts.map((r) => (
                                  <tr key={r.id}>
                                    <td className="p-2.5 font-mono text-cyan-400 font-bold">
                                      {r.receiptNumber}
                                    </td>
                                    <td className="p-2.5 text-slate-300 uppercase font-mono">
                                      {r.type}
                                    </td>
                                    <td className="p-2.5 text-white font-bold">
                                      {formatMinor(r.amountMinor, r.currency)}
                                    </td>
                                    <td className="p-2.5 text-slate-400">
                                      {r.createdAt
                                        ? new Date(r.createdAt).toLocaleDateString()
                                        : "—"}
                                    </td>
                                    <td className="p-2.5 flex gap-2">
                                      <button
                                        onClick={() => alert(`Receipt #${r.receiptNumber} viewed`)}
                                        className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px]"
                                      >
                                        View
                                      </button>
                                      <button
                                        onClick={() =>
                                          alert(
                                            `Receipt #${r.receiptNumber} resent to ${userDetails.profile.email}`,
                                          )
                                        }
                                        className="px-2 py-1 bg-cyan-950 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded text-[11px]"
                                      >
                                        Resend Email
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 5: Watch History */}
                    {activeTab === "watchHistory" && (
                      <div className="space-y-4 text-xs">
                        <h4 className="font-bold text-slate-300">
                          Viewed Videos & Playback Telemetry
                        </h4>
                        {userDetails.watchHistory.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No watch history on record.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            <table className="w-full text-left">
                              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">Date</th>
                                  <th className="p-2.5">Video Title</th>
                                  <th className="p-2.5">Watch Duration</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                                {userDetails.watchHistory.map((w) => (
                                  <tr key={w.id}>
                                    <td className="p-2.5 text-slate-400">
                                      {w.createdAt ? new Date(w.createdAt).toLocaleString() : "—"}
                                    </td>
                                    <td className="p-2.5 text-white font-medium">{w.title}</td>
                                    <td className="p-2.5 text-cyan-400 font-mono">
                                      {Math.round(w.watchedSeconds / 60)} min ({w.watchedSeconds}s)
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 6: Devices and Sessions */}
                    {activeTab === "devices" && (
                      <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-slate-300">Registered Client Devices</h4>
                          <button
                            onClick={() => {
                              setPendingAction("force_signout_all");
                              setActionPayload({});
                            }}
                            className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded font-medium"
                          >
                            Sign Out Everywhere
                          </button>
                        </div>
                        {userDetails.devices.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No devices registered for this user.
                          </div>
                        ) : (
                          <div className="overflow-x-auto border border-slate-800 rounded-lg">
                            <table className="w-full text-left">
                              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">Device</th>
                                  <th className="p-2.5">Platform</th>
                                  <th className="p-2.5">Network Prefix</th>
                                  <th className="p-2.5">Last Active</th>
                                  <th className="p-2.5">Status</th>
                                  <th className="p-2.5">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-900/50">
                                {userDetails.devices.map((d) => (
                                  <tr key={d.id}>
                                    <td className="p-2.5 font-medium text-white">
                                      {d.deviceModel}
                                    </td>
                                    <td className="p-2.5 text-cyan-400 uppercase font-mono">
                                      {d.platform}
                                    </td>
                                    <td className="p-2.5 font-mono text-slate-400">{d.ipPrefix}</td>
                                    <td className="p-2.5 text-slate-400">
                                      {d.lastActiveAt
                                        ? new Date(d.lastActiveAt).toLocaleString()
                                        : "—"}
                                    </td>
                                    <td className="p-2.5">
                                      {d.revoked ? (
                                        <span className="text-red-400 font-semibold">Revoked</span>
                                      ) : (
                                        <span className="text-emerald-400 font-semibold">
                                          Active
                                        </span>
                                      )}
                                    </td>
                                    <td className="p-2.5">
                                      {!d.revoked && (
                                        <button
                                          onClick={() => {
                                            setPendingAction("revoke_device");
                                            setActionPayload({ deviceId: d.id });
                                          }}
                                          className="px-2 py-1 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 rounded text-[11px]"
                                        >
                                          Revoke
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 7: Comments */}
                    {activeTab === "comments" && (
                      <div className="space-y-4 text-xs">
                        <h4 className="font-bold text-slate-300">Viewer Comments</h4>
                        {userDetails.comments.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No comments posted by this viewer.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {userDetails.comments.map((c) => (
                              <div
                                key={c.id}
                                className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-start justify-between gap-4"
                              >
                                <div>
                                  <p className="text-white text-xs">{c.text}</p>
                                  <span className="text-[10px] text-slate-500 font-mono">
                                    Video: {c.videoId} •{" "}
                                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : ""}
                                  </span>
                                </div>
                                <span
                                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                                    c.hidden
                                      ? "bg-red-950 text-red-400 border border-red-800"
                                      : "bg-emerald-950 text-emerald-400"
                                  }`}
                                >
                                  {c.hidden ? "Hidden" : "Public"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* TAB 8: Security & PIN */}
                    {activeTab === "security" && (
                      <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-4 text-xs">
                        <h4 className="font-bold text-slate-300 text-sm">
                          Security & Access Management
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-bold text-white block">Password Reset Link</span>
                            <p className="text-slate-400 text-[11px]">
                              Send an official password reset link directly to the user's registered
                              email address. The owner never sees or sets passwords.
                            </p>
                            <button
                              onClick={() => {
                                setPendingAction("send_password_reset");
                                setActionPayload({});
                              }}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium"
                            >
                              Send Password Reset Email
                            </button>
                          </div>

                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-bold text-white block">Email Verification</span>
                            <p className="text-slate-400 text-[11px]">
                              Current status:{" "}
                              {userDetails.profile.emailVerified ? "Verified" : "Unverified"}. You
                              can manually mark this email as verified upon manual proof.
                            </p>
                            {!userDetails.profile.emailVerified && (
                              <button
                                onClick={() => {
                                  setPendingAction("mark_email_verified");
                                  setActionPayload({});
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium"
                              >
                                Mark Email Verified
                              </button>
                            )}
                          </div>

                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-bold text-white block">Parental Control PIN</span>
                            <p className="text-slate-400 text-[11px]">
                              {userDetails.profile.parentalPinConfigured
                                ? "PIN is configured and gating adult content."
                                : "No parental PIN set on this account."}
                            </p>
                            {userDetails.profile.parentalPinConfigured && (
                              <button
                                onClick={() => {
                                  setPendingAction("disable_parental_pin");
                                  setActionPayload({});
                                }}
                                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium"
                              >
                                Disable Parental PIN
                              </button>
                            )}
                          </div>

                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg space-y-2">
                            <span className="font-bold text-white block">
                              Change Country Setting
                            </span>
                            <p className="text-slate-400 text-[11px]">
                              Country can be changed only before the viewer has established wallet
                              ledger transactions.
                            </p>
                            <button
                              onClick={() => {
                                const newCountry = prompt(
                                  "Enter 2-letter ISO country code (e.g. US, GH, KE, NG):",
                                );
                                if (newCountry && newCountry.length === 2) {
                                  setPendingAction("change_country");
                                  setActionPayload({ country: newCountry.toUpperCase() });
                                }
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded font-medium"
                            >
                              Change Country ({userDetails.profile.country})
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 9: Notes */}
                    {activeTab === "notes" && (
                      <div className="space-y-4 text-xs">
                        <h4 className="font-bold text-slate-300">Owner & Support Internal Notes</h4>
                        {userDetails.notes.length === 0 ? (
                          <div className="p-6 bg-slate-950 border border-slate-800 rounded-lg text-center text-slate-500">
                            No internal notes added.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {userDetails.notes.map((n) => (
                              <div
                                key={n.id}
                                className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1"
                              >
                                <p className="text-white">{n.text}</p>
                                <div className="text-[10px] text-slate-500 font-mono">
                                  Operator: {n.authorUid} •{" "}
                                  {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Confirmation Modal (Enforcing Mandatory Reason) */}
        {pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  Confirm Action: {pendingAction.replace(/_/g, " ").toUpperCase()}
                </h3>
                <button
                  onClick={() => setPendingAction(null)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-300">
                Every operator write requires a clear reason and is permanently recorded in
                the immutable audit log.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Reason for this action (min 3 characters):
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="State the justification, ticket reference, or reason..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || actionReason.trim().length < 3}
                  onClick={() => handleExecuteAction()}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded text-xs font-bold"
                >
                  {submittingAction ? "Processing..." : "Confirm & Execute"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Send User Message Modal */}
        {showMessageModal && selectedUid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Mail className="w-5 h-5 text-blue-400" />
                  Send Message to Viewer
                </h3>
                <button
                  onClick={() => setShowMessageModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Message Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => {
                      const t = templates.find((tpl) => tpl.id === e.target.value);
                      setSelectedTemplate(e.target.value);
                      if (t && t.id !== "custom") {
                        setMessageSubject(t.subject);
                        setMessageBody(t.body);
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Delivery Channel
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={messageChannel === "in_app"}
                        onChange={() => setMessageChannel("in_app")}
                      />
                      <span>In-App Notice Only</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={messageChannel === "email"}
                        onChange={() => setMessageChannel("email")}
                      />
                      <span>Email Only</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-slate-300 cursor-pointer">
                      <input
                        type="radio"
                        checked={messageChannel === "both"}
                        onChange={() => setMessageChannel("both")}
                      />
                      <span>Both Channels</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Subject</label>
                  <input
                    type="text"
                    value={messageSubject}
                    onChange={(e) => setMessageSubject(e.target.value)}
                    placeholder="Enter message title..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Message Content</label>
                  <textarea
                    rows={4}
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    placeholder="Type the message to the user..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMessageModal(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !messageSubject.trim() || !messageBody.trim()}
                  onClick={async () => {
                    await handleExecuteAction({
                      action: "send_message",
                      channel: messageChannel,
                      subject: messageSubject,
                      message: messageBody,
                      templateId: selectedTemplate,
                      reason: `Direct viewer message: ${messageSubject}`,
                    });
                    setShowMessageModal(false);
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs font-bold flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Notification</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Wallet Adjustment Modal */}
        {showWalletModal && selectedUid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-emerald-400" />
                  Manual Wallet Balance Adjustment
                </h3>
                <button
                  onClick={() => setShowWalletModal(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">Adjustment Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWalletAdjustType("CREDIT")}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 border ${
                        walletAdjustType === "CREDIT"
                          ? "bg-emerald-600 text-white border-emerald-500"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>Credit (+)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setWalletAdjustType("DEBIT")}
                      className={`flex-1 py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 border ${
                        walletAdjustType === "DEBIT"
                          ? "bg-red-600 text-white border-red-500"
                          : "bg-slate-950 text-slate-400 border-slate-800"
                      }`}
                    >
                      <MinusCircle className="w-4 h-4" />
                      <span>Debit (-)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Amount ({userDetails?.wallet.currency || "NGN"})
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={walletAmountMajor}
                    onChange={(e) => setWalletAmountMajor(e.target.value)}
                    placeholder="e.g. 500"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Mandatory Reason / Audit Justification
                  </label>
                  <textarea
                    rows={3}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="State reason (e.g. Compensation for stream outage ref #1234)..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowWalletModal(false)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    submittingAction ||
                    !walletAmountMajor ||
                    Number(walletAmountMajor) <= 0 ||
                    actionReason.trim().length < 3
                  }
                  onClick={async () => {
                    const amountMinor = Math.round(Number(walletAmountMajor) * 100);
                    await handleExecuteAction({
                      action: "wallet_adjust",
                      type: walletAdjustType,
                      amountMinor,
                      reason: actionReason,
                    });
                    setShowWalletModal(false);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-bold"
                >
                  {submittingAction ? "Processing..." : "Execute Adjustment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
