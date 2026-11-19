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
  ShieldCheck,
  Users,
  UserPlus,
  Lock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  UserX,
  UserCheck,
  X,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/team")({
  component: ZillionaireTeamRoute,
  head: () => ({
    meta: [
      { title: "Team & Roles | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface TeamMember {
  uid: string;
  email: string;
  modules: string[];
  status: string;
  expiryDate: string | null;
  lastActive: string | null;
  roleTemplate: string;
}

interface RoleTemplate {
  label: string;
  description: string;
  modules: string[];
}

function ZillionaireTeamRoute() {
  return (
    <ConsolePageGuard role="zillionaire" module="roles">
      {({ token, account, onLock }) => (
        <ZillionaireTeamContent token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ZillionaireTeamContent({
  token,
  account,
  onLock,
}: {
  token: string;
  account: { email: string | null; isOwner: boolean; modules: string[] };
  onLock?: () => void;
}) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<Record<string, RoleTemplate>>({});
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Invite modal state
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("content_manager");
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [inviteExpiry, setInviteExpiry] = useState("");
  const [inviteReason, setInviteReason] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState("");

  // Edit/Action state
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);

  const fetchTeam = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/zillionaire/team", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load team data");
      setMembers(data.team || []);
      setRoleTemplates(data.roleTemplates || {});
      setAvailableModules(data.availableModules || []);
      if (data.roleTemplates && data.roleTemplates["content_manager"]) {
        setSelectedModules(data.roleTemplates["content_manager"].modules);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading team");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchTeam();
  }, [token]);

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey !== "custom" && roleTemplates[templateKey]) {
      setSelectedModules(roleTemplates[templateKey].modules);
    }
  };

  const toggleModule = (mod: string) => {
    setSelectedTemplate("custom");
    setSelectedModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || selectedModules.length === 0 || !inviteReason.trim()) {
      setInviteError("Please enter email, choose at least one module, and provide a valid reason.");
      return;
    }

    setInviting(true);
    setInviteError("");
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/zillionaire/team", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: inviteEmail.trim(),
          roleTemplate: selectedTemplate,
          modules: selectedModules,
          expiryDate: inviteExpiry ? new Date(inviteExpiry).toISOString() : undefined,
          reason: inviteReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite member");

      setSuccessMessage(`Role delegated to ${inviteEmail} successfully.`);
      setInviteModalOpen(false);
      setInviteEmail("");
      setInviteReason("");
      setInviteExpiry("");
      void fetchTeam();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Error inviting member");
    } finally {
      setInviting(false);
    }
  };

  const handleToggleSuspend = async (member: TeamMember) => {
    const nextStatus = member.status === "suspended" ? "active" : "suspended";
    const confirmText = `Are you sure you want to ${
      nextStatus === "suspended" ? "suspend" : "re-activate"
    } access for ${member.email}?`;
    if (!window.confirm(confirmText)) return;

    setActionBusyUid(member.uid);
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch(`/api/public/v1/zillionaire/team/${member.uid}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          status: nextStatus,
          reason: `Manual status toggle to ${nextStatus} by owner`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update member status");
      setSuccessMessage(`Account ${member.email} set to ${nextStatus}.`);
      void fetchTeam();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error updating member");
    } finally {
      setActionBusyUid(null);
    }
  };

  const handleRevoke = async (member: TeamMember) => {
    const confirmText = `REVOKE PERMISSIONS: Are you sure you want to instantly revoke all delegated modules for ${member.email}? This action is immediate and audited.`;
    if (!window.confirm(confirmText)) return;

    setActionBusyUid(member.uid);
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch(`/api/public/v1/zillionaire/team/${member.uid}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to revoke member permissions");
      setSuccessMessage(`All permissions revoked for ${member.email}.`);
      void fetchTeam();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error revoking permissions");
    } finally {
      setActionBusyUid(null);
    }
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.status === "active").length;
    const suspended = members.filter((m) => m.status === "suspended").length;
    const expiringSoon = members.filter((m) => {
      if (!m.expiryDate) return false;
      const days = (new Date(m.expiryDate).getTime() - Date.now()) / (1000 * 3600 * 24);
      return days > 0 && days <= 14;
    }).length;
    return { total, active, suspended, expiringSoon };
  }, [members]);

  const tableColumns = [
    {
      key: "email",
      header: "Team Member",
      sortable: true,
      render: (m: TeamMember) => (
        <div className="flex flex-col">
          <span className="font-bold text-white text-xs truncate">{m.email}</span>
          <span className="text-[10px] text-slate-400 font-mono truncate">{m.uid}</span>
        </div>
      ),
    },
    {
      key: "roleTemplate",
      header: "Template",
      render: (m: TeamMember) => (
        <span className="text-xs text-blue-300 capitalize font-medium">
          {m.roleTemplate.replace(/_/g, " ")}
        </span>
      ),
    },
    {
      key: "modules",
      header: "Delegated Modules",
      render: (m: TeamMember) => (
        <div className="flex flex-wrap gap-1 max-w-xs">
          {m.modules.map((mod) => (
            <span
              key={mod}
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-950/70 border border-cyan-500/30 text-cyan-300"
            >
              {mod}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (m: TeamMember) => (
        <ConsoleStatusBadge
          status={
            m.status === "active" ? "active" : m.status === "suspended" ? "suspended" : "warning"
          }
          label={m.status.toUpperCase()}
        />
      ),
    },
    {
      key: "expiryDate",
      header: "Expiry",
      render: (m: TeamMember) => (
        <span className="text-xs text-slate-300">
          {m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : "Never (Permanent)"}
        </span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right" as const,
      render: (m: TeamMember) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => handleToggleSuspend(m)}
            disabled={actionBusyUid === m.uid}
            className={`p-1.5 rounded-lg border text-xs transition ${
              m.status === "suspended"
                ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                : "bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30"
            }`}
            title={m.status === "suspended" ? "Unsuspend account" : "Suspend account"}
          >
            {m.status === "suspended" ? (
              <UserCheck className="h-3.5 w-3.5" />
            ) : (
              <UserX className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => handleRevoke(m)}
            disabled={actionBusyUid === m.uid}
            className="p-1.5 rounded-lg border border-rose-500/40 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 transition text-xs"
            title="Revoke all delegated permissions"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Team & Role Delegations"
      tagline="Assign, audit and revoke granular module access across BQ SQWAD TV operations"
      activePath="/zillionaire/team"
      account={{
        email: account.email || undefined,
        isOwner: account.isOwner,
        modules: account.modules,
      }}
      onLock={onLock}
      onRefresh={fetchTeam}
      isRefreshing={loading}
    >
      {/* Notifications / Alerts */}
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

      {/* Welcome Banner with Primary Action */}
      <ConsoleWelcomeBanner
        title="Role-Based Module Delegation"
        description="Only explicit module grants are recognized by the backend. Custom claims or tags alone grant zero access. All role grants, modifications and revocations are appended to the tamper-evident audit ledger."
        badgeText="Security & Governance"
        actionLabel={account.isOwner ? "Delegate Team Member" : undefined}
        onAction={account.isOwner ? () => setInviteModalOpen(true) : undefined}
      />

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <ConsoleKpiCard
          title="Total Delegated Staff"
          value={kpis.total}
          subtitle="Configured team accounts"
          variant="blue"
          icon={Users}
        />
        <ConsoleKpiCard
          title="Active Operators"
          value={kpis.active}
          subtitle="Currently authorized"
          variant="green"
          icon={CheckCircle2}
        />
        <ConsoleKpiCard
          title="Expiring Within 14 Days"
          value={kpis.expiringSoon}
          subtitle="Require owner extension"
          variant="gold"
          icon={Calendar}
        />
        <ConsoleKpiCard
          title="Suspended Accounts"
          value={kpis.suspended}
          subtitle="Access blocked immediately"
          variant="purple"
          icon={Lock}
        />
      </div>

      {/* Team Members Table */}
      <ConsoleCard
        title="Delegated Staff & Role Assignments"
        description="Inspect all accounts with delegated permissions. Each action is verified against server roles and signed in the audit log."
        actions={
          account.isOwner && (
            <button
              onClick={() => setInviteModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Add Member</span>
            </button>
          )
        }
      >
        <ConsoleTable
          columns={tableColumns}
          data={members}
          keyField="uid"
          searchPlaceholder="Search staff by email or UID..."
          emptyTitle="No team delegates found"
          emptyDescription="No users currently hold delegated module permissions."
        />
      </ConsoleCard>

      {/* Invite Modal */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-[#091126] p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Delegate Team Permissions</h3>
              </div>
              <button
                onClick={() => setInviteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inviteError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs font-semibold">
                {inviteError}
              </div>
            )}

            <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  User Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="operator@bqsquad.tv"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/40 px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Role Template</label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-black/40 px-3 py-2 text-white outline-none focus:border-blue-500"
                >
                  {Object.entries(roleTemplates).map(([key, tmpl]) => (
                    <option key={key} value={key}>
                      {tmpl.label} ({tmpl.modules.join(", ")})
                    </option>
                  ))}
                  <option value="custom">Custom Module Selection</option>
                </select>
                {roleTemplates[selectedTemplate] && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {roleTemplates[selectedTemplate].description}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Assigned Modules ({selectedModules.length} selected) *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 rounded-xl border border-slate-800 bg-black/30 max-h-48 overflow-y-auto">
                  {availableModules.map((mod) => {
                    const isChecked = selectedModules.includes(mod);
                    return (
                      <button
                        type="button"
                        key={mod}
                        onClick={() => toggleModule(mod)}
                        className={`p-2 rounded-lg border text-left transition flex items-center justify-between text-xs ${
                          isChecked
                            ? "bg-blue-600/30 border-blue-500/50 text-white font-bold"
                            : "bg-white/5 border-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        <span className="truncate">{mod}</span>
                        {isChecked && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Expiration Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={inviteExpiry}
                    onChange={(e) => setInviteExpiry(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-black/40 px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Audit Justification *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Reason for role assignment..."
                    value={inviteReason}
                    onChange={(e) => setInviteReason(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-black/40 px-3 py-2 text-white placeholder-slate-500 outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInviteModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/5 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition shadow-lg shadow-blue-600/30 disabled:opacity-50"
                >
                  {inviting ? "Granting Roles..." : "Grant Delegated Roles"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ConsoleShell>
  );
}
