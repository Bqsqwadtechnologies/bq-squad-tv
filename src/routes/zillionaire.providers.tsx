import { useState, useEffect, useMemo, type FormEvent } from "react";
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
  Tv2,
  MailCheck,
  FileCheck2,
  AlertCircle,
  Play,
  Plus,
  Ban,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  LoaderCircle,
  FileText,
  DollarSign,
  Radio,
  Search,
  Filter,
  X,
  MessageSquare,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { formatMinorCurrency as formatMoney } from "@/lib/format-money";

export const Route = createFileRoute("/zillionaire/providers")({
  component: ZillionaireProvidersRoute,
  head: () => ({
    meta: [
      { title: "Providers, Licence Vault & Live TV | Zillionaire Control" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ProviderItem {
  id: string;
  name: string;
  contactEmail: string;
  settlementCurrency: string;
  providerShareBps: number;
  status: string;
  createdAt: string | null;
}

interface ApprovedEmailItem {
  email: string;
  status: string;
  addedAt: string | null;
  verifiedAt: string | null;
  grantedAt: string | null;
  grantedBy: string | null;
  notes: string;
}

interface ContractItem {
  id: string;
  providerId: string;
  agreementReference: string;
  territories: string[];
  platforms: string[];
  revenueModel: string;
  providerShareBps: number;
  settlementCurrency: string;
  validFrom: string | null;
  validUntil: string | null;
  version: number;
  status: string;
}

interface StatementItem {
  id: string;
  providerId: string;
  period: string;
  status: string;
  currency: string;
  grossRevenueMinor: number;
  grossProfitMinor: number;
  providerEarningsMinor: number;
  platformShareMinor: number;
  paidAt: string | null;
}

interface DisputeItem {
  id: string;
  providerId: string;
  subject: string;
  statementId: string | null;
  channelId: string | null;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  messagesCount: number;
}

interface LiveChannel {
  id: string;
  providerId: string;
  name: string;
  logoUrl: string | null;
  categories: string[];
  language: string;
  status: string;
  health: string;
  streamUrl: string;
  licenceExpiresAt: string | null;
  playbackTestPassed: boolean;
}

function ZillionaireProvidersRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="providers">
      {({ token, account, onLock }) => (
        <ZillionaireProvidersContent token={token} account={account} {...(onLock ? { onLock } : {})} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireProvidersContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<
    "approved_emails" | "vault" | "statements" | "disputes" | "channels"
  >("approved_emails");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [approvedEmails, setApprovedEmails] = useState<ApprovedEmailItem[]>([]);
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [statements, setStatements] = useState<StatementItem[]>([]);
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [channels, setChannels] = useState<LiveChannel[]>([]);

  // Approved Email Actions
  const [newEmail, setNewEmail] = useState("");
  const [newEmailNotes, setNewEmailNotes] = useState("");
  const [emailActionBusy, setEmailActionBusy] = useState(false);

  // Contract Modal
  const [showNewContract, setShowNewContract] = useState(false);
  const [cProviderId, setCProviderId] = useState("");
  const [cRef, setCRef] = useState("");
  const [cValidFrom, setCValidFrom] = useState("");
  const [cValidUntil, setCValidUntil] = useState("");
  const [cShareBps, setCShareBps] = useState(2500);

  // Playback testing
  const [testingId, setTestingId] = useState<string | null>(null);

  // Dispute resolution modal
  const [resolvingDispute, setResolvingDispute] = useState<DisputeItem | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolveBusy, setResolveBusy] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const [resMain, resEmails, resChannels] = await Promise.all([
        fetch("/api/public/v1/zillionaire/providers/", { headers }),
        fetch("/api/public/v1/zillionaire/providers/approved-emails", { headers }),
        fetch("/api/public/v1/zillionaire/providers/channels", { headers }),
      ]);

      if (resMain.ok) {
        const data = await resMain.json();
        setProviders(data.providers || []);
        setContracts(data.contracts || []);
        setStatements(data.statements || []);
        setDisputes(data.disputes || []);
      }
      if (resEmails.ok) {
        const data = await resEmails.json();
        setApprovedEmails(data.approvedEmails || []);
      }
      if (resChannels.ok) {
        const data = await resChannels.json();
        setChannels(data.channels || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading provider data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [token]);

  const handleEmailAction = async (
    action: "add" | "verify" | "grant" | "revoke" | "suspend",
    emailTarget?: string,
  ) => {
    const emailToUse = emailTarget || newEmail.trim().toLowerCase();
    if (!emailToUse || !emailToUse.includes("@")) {
      alert("A valid email is required.");
      return;
    }

    let reason = "Console administrator action";
    if (action === "revoke") {
      const confirmed = confirm(
        `Are you sure you want to REVOKE access for ${emailToUse}? This terminates all active provider sessions immediately.`,
      );
      if (!confirmed) return;
      reason = prompt("Provide audit reason for revoking provider email access:") || "Revocation by admin";
    }

    setEmailActionBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/zillionaire/providers/approved-emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          email: emailToUse,
          notes: newEmailNotes,
          reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Email approval action failed");

      setSuccessMessage(`Email ${emailToUse} status updated to ${action.toUpperCase()}.`);
      if (!emailTarget) {
        setNewEmail("");
        setNewEmailNotes("");
      }
      void loadData();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setEmailActionBusy(false);
    }
  };

  const handleCreateContract = async (e: FormEvent) => {
    e.preventDefault();
    if (!cProviderId || !cRef.trim()) {
      alert("Please choose a provider and enter an agreement reference.");
      return;
    }

    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/zillionaire/providers/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_contract",
          providerId: cProviderId,
          agreementReference: cRef.trim(),
          validFrom: cValidFrom ? new Date(cValidFrom).toISOString() : new Date().toISOString(),
          validUntil: cValidUntil ? new Date(cValidUntil).toISOString() : null,
          providerShareBps: cShareBps,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create contract");

      setSuccessMessage("Licence contract registered in vault.");
      setShowNewContract(false);
      setCRef("");
      void loadData();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error creating contract");
    }
  };

  const handleResolveDispute = async () => {
    if (!resolvingDispute) return;
    setResolveBusy(true);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/zillionaire/providers/", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "resolve_dispute",
          disputeId: resolvingDispute.id,
          resolutionNotes: resolutionNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resolve dispute");

      setSuccessMessage(`Dispute ${resolvingDispute.id} marked as resolved.`);
      setResolvingDispute(null);
      setResolutionNotes("");
      void loadData();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error resolving dispute");
    } finally {
      setResolveBusy(false);
    }
  };

  const handleRunPlaybackTest = async (channelId: string) => {
    setTestingId(channelId);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/zillionaire/providers/test-playback", {
        method: "POST",
        headers,
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      alert(data.message || "Playback test executed.");
      void loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Playback test failed");
    } finally {
      setTestingId(null);
    }
  };

  const kpis = useMemo(() => {
    const grantedEmails = approvedEmails.filter((e) => e.status === "granted").length;
    const totalContracts = contracts.length;
    const openDisputes = disputes.filter((d) => d.status === "open").length;
    const activeChannels = channels.filter((c) => c.status === "published").length;
    return { grantedEmails, totalContracts, openDisputes, activeChannels };
  }, [approvedEmails, contracts, disputes, channels]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Providers, Contracts & Broadcast"
      tagline="Approved partner allowlist, licence vault, statements, disputes, and live broadcast verification"
      activePath="/zillionaire/providers"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={loadData}
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
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ConsoleWelcomeBanner
        title="Channel Partner Governance & Live Ingest"
        description="Provider Console sign-up is strictly gated by the approved email allowlist. Revoking any email instantly terminates active sessions."
        badgeText="Partner Allowlist Active"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Approved Partner Emails"
          value={kpis.grantedEmails}
          subtitle="Authorized provider signups"
          variant="blue"
          icon={MailCheck}
        />
        <ConsoleKpiCard
          title="Licence Contracts in Vault"
          value={kpis.totalContracts}
          subtitle="Signed broadcast agreements"
          variant="green"
          icon={FileCheck2}
        />
        <ConsoleKpiCard
          title="Active Disputes"
          value={kpis.openDisputes}
          subtitle="Partner settlement queries"
          variant="gold"
          icon={AlertCircle}
        />
        <ConsoleKpiCard
          title="Live Broadcast Channels"
          value={kpis.activeChannels}
          subtitle="Verified linear FAST streams"
          variant="purple"
          icon={Tv2}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 gap-2 text-xs">
        {[
          { key: "approved_emails", label: "Approved Emails Allowlist", icon: MailCheck },
          { key: "vault", label: "Licence & Contract Vault", icon: FileCheck2 },
          { key: "statements", label: "Statements & Settlements", icon: DollarSign },
          { key: "disputes", label: "Disputes & Inquiries", icon: MessageSquare },
          { key: "channels", label: "Live Channels & Test Playback", icon: Tv2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2.5 font-bold transition border-b-2 -mb-px ${
                isActive
                  ? "border-purple-500 text-white bg-purple-500/10 rounded-t-lg"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Approved Emails */}
      {activeTab === "approved_emails" && (
        <ConsoleCard
          title="Provider Sign-up Allowlist"
          description="Only representatives with approved emails in 'granted' status can sign in to the Channel Partner Console. Revoking instantly invalidates active sessions."
        >
          {/* Add email box */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 mb-6 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5 text-purple-400" />
              Add Partner Representative Email
            </h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                placeholder="partner.rep@broadcaster.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
              />
              <input
                type="text"
                placeholder="Optional notes or partner organisation..."
                value={newEmailNotes}
                onChange={(e) => setNewEmailNotes(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
              />
              <button
                type="button"
                onClick={() => handleEmailAction("add")}
                disabled={emailActionBusy}
                className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition disabled:opacity-50"
              >
                Add Pending
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Authorized Email</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Notes</th>
                  <th className="py-2.5 px-3">Added Date</th>
                  <th className="py-2.5 px-3 text-right">Allowlist Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {approvedEmails.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No approved provider emails recorded.
                    </td>
                  </tr>
                ) : (
                  approvedEmails.map((item) => (
                    <tr key={item.email} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-white">{item.email}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === "granted"
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              : item.status === "verified"
                                ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                                : item.status === "revoked"
                                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{item.notes || "—"}</td>
                      <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                        {item.addedAt ? new Date(item.addedAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {item.status !== "verified" && item.status !== "granted" && (
                            <button
                              onClick={() => handleEmailAction("verify", item.email)}
                              className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300 font-bold text-[11px] hover:bg-blue-500/20 transition"
                            >
                              Verify
                            </button>
                          )}
                          {item.status !== "granted" && (
                            <button
                              onClick={() => handleEmailAction("grant", item.email)}
                              className="px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] hover:bg-emerald-500/20 transition"
                            >
                              Grant
                            </button>
                          )}
                          {item.status !== "suspended" && (
                            <button
                              onClick={() => handleEmailAction("suspend", item.email)}
                              className="px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold text-[11px] hover:bg-amber-500/20 transition"
                            >
                              Suspend
                            </button>
                          )}
                          {item.status !== "revoked" && (
                            <button
                              onClick={() => handleEmailAction("revoke", item.email)}
                              className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold text-[11px] hover:bg-rose-500/20 transition"
                              title="Immediately revokes sessions"
                            >
                              Revoke
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
      )}

      {/* Tab 2: Licence & Contract Vault */}
      {activeTab === "vault" && (
        <ConsoleCard
          title="Licence & Broadcast Contract Vault"
          description="Legally binding agreements defining FAST revenue sharing models, permitted broadcast territories, and expiration windows."
        >
          <div className="flex justify-between items-center mb-4">
            <span className="text-xs text-slate-400">Total Contracts: {contracts.length}</span>
            <button
              onClick={() => setShowNewContract(true)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New Agreement
            </button>
          </div>

          {showNewContract && (
            <form
              onSubmit={handleCreateContract}
              className="p-4 rounded-xl bg-slate-900 border border-slate-800 mb-6 space-y-3"
            >
              <h4 className="text-xs font-bold text-white">Register Vault Contract</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Provider Entity *</label>
                  <select
                    required
                    value={cProviderId}
                    onChange={(e) => setCProviderId(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="">Select Provider...</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Agreement Reference *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. BQ-FAST-2026-001"
                    value={cRef}
                    onChange={(e) => setCRef(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={cValidFrom}
                    onChange={(e) => setCValidFrom(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Valid Until (Expiry)</label>
                  <input
                    type="date"
                    value={cValidUntil}
                    onChange={(e) => setCValidUntil(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewContract(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-800 text-slate-300 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-bold text-xs"
                >
                  Save Contract
                </button>
              </div>
            </form>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Agreement Ref</th>
                  <th className="py-2.5 px-3">Provider ID</th>
                  <th className="py-2.5 px-3">Gross Share</th>
                  <th className="py-2.5 px-3">Territories</th>
                  <th className="py-2.5 px-3">Valid Window</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {contracts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No contracts registered in vault.
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-purple-300">{c.agreementReference}</td>
                      <td className="py-2.5 px-3 text-slate-300">{c.providerId}</td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {(c.providerShareBps / 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">{c.territories.join(", ")}</td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-400">
                        {c.validFrom ? new Date(c.validFrom).toLocaleDateString() : "—"} to{" "}
                        {c.validUntil ? new Date(c.validUntil).toLocaleDateString() : "Indefinite"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 3: Statements & Settlements */}
      {activeTab === "statements" && (
        <ConsoleCard
          title="Provider Monthly Settlement Statements"
          description="Audited gross revenue, deductible infrastructure costs, and calculated partner earnings."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Statement Ref</th>
                  <th className="py-2.5 px-3">Provider ID</th>
                  <th className="py-2.5 px-3">Period</th>
                  <th className="py-2.5 px-3">Gross Revenue</th>
                  <th className="py-2.5 px-3">Net Profit</th>
                  <th className="py-2.5 px-3">Provider Earnings</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {statements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      No settlement statements generated yet.
                    </td>
                  </tr>
                ) : (
                  statements.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono text-purple-300 font-bold">{s.id}</td>
                      <td className="py-2.5 px-3 text-slate-300">{s.providerId}</td>
                      <td className="py-2.5 px-3 text-slate-400">{s.period}</td>
                      <td className="py-2.5 px-3 font-mono text-white">
                        {formatMoney(s.grossRevenueMinor, s.currency)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-blue-300">
                        {formatMoney(s.grossProfitMinor, s.currency)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-emerald-400 font-bold">
                        {formatMoney(s.providerEarningsMinor, s.currency)}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            s.status === "closed" || s.paidAt
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-amber-500/20 text-amber-300"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 4: Disputes */}
      {activeTab === "disputes" && (
        <ConsoleCard
          title="Channel Partner Disputes & Queries"
          description="Resolution portal for billing discrepancies, stream quality challenges, or metric inquiries."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="py-2.5 px-3">Dispute ID</th>
                  <th className="py-2.5 px-3">Provider ID</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Messages</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {disputes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      No active or historical disputes found.
                    </td>
                  </tr>
                ) : (
                  disputes.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-900/40 transition">
                      <td className="py-2.5 px-3 font-mono text-purple-300 font-bold">{d.id}</td>
                      <td className="py-2.5 px-3 text-slate-300">{d.providerId}</td>
                      <td className="py-2.5 px-3 font-semibold text-white">{d.subject}</td>
                      <td className="py-2.5 px-3 text-slate-400">{d.messagesCount} message(s)</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            d.status === "resolved"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {d.status !== "resolved" && (
                          <button
                            onClick={() => {
                              setResolvingDispute(d);
                              setResolutionNotes("");
                            }}
                            className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-xs hover:bg-emerald-500/20 transition"
                          >
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </ConsoleCard>
      )}

      {/* Tab 5: Live Broadcast Channels & Test Playback */}
      {activeTab === "channels" && (
        <ConsoleCard
          title="Live FAST Channels & Zero-Billing Test Playback"
          description="Run non-metered validation checks on provider HLS manifests to verify segment health prior to publishing."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {channels.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-sm text-white">{c.name}</h4>
                    <span className="text-[11px] text-slate-400">
                      {c.categories.join(", ")} • Provider: {c.providerId}
                    </span>
                  </div>
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

                <div className="text-xs space-y-1.5 py-2 border-y border-slate-800 text-slate-400">
                  <div className="truncate">
                    Stream: <span className="font-mono text-slate-300 text-[11px]">{c.streamUrl}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span>Playback Health:</span>
                    {c.playbackTestPassed ? (
                      <span className="text-emerald-400 flex items-center gap-1 text-[11px] font-bold">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Passed & Ready
                      </span>
                    ) : (
                      <span className="text-amber-400 flex items-center gap-1 text-[11px] font-bold">
                        <AlertCircle className="w-3.5 h-3.5" /> Untested
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleRunPlaybackTest(c.id)}
                    disabled={testingId === c.id}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-bold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
                  >
                    {testingId === c.id ? (
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    Run Test Playback (No Billing)
                  </button>
                </div>
              </div>
            ))}
            {channels.length === 0 && (
              <div className="col-span-3 py-8 text-center text-slate-500">
                No linear broadcast channels found.
              </div>
            )}
          </div>
        </ConsoleCard>
      )}

      {/* Resolve Dispute Modal */}
      {resolvingDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Resolve Partner Dispute</h3>
              </div>
              <button
                onClick={() => setResolvingDispute(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-slate-300">
                Resolving dispute <strong className="text-white font-mono">{resolvingDispute.id}</strong>:{" "}
                <span className="text-slate-400">{resolvingDispute.subject}</span>
              </p>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Resolution Notes & Audit Summary *
                </label>
                <textarea
                  rows={3}
                  placeholder="Record resolution outcome, credit adjustments, or agreement terms..."
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/50 p-2.5 text-white outline-none focus:border-emerald-500 text-xs"
                />
              </div>

              <div className="pt-3 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResolvingDispute(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResolveDispute}
                  disabled={resolveBusy}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                >
                  {resolveBusy ? "Resolving..." : "Confirm Resolution"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
