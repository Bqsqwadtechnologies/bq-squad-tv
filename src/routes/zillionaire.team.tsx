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
  History,
  Layers,
  Clock,
  Sparkles,
  Info,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { requestZillionaireStepUp } from "@/lib/zillionaire-step-up";
import { DASHBOARD_PERMISSIONS, type DashboardPermission } from "@/lib/team-types";

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
  roleName?: string | null;
  createdAt?: string | null;
}

interface RoleTemplate {
  label: string;
  description: string;
  modules: string[];
}

interface AuditActivity {
  id: string;
  actorUid: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string;
  createdAt: string;
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
  const [activeTab, setActiveTab] = useState<"members" | "roles" | "activity">("members");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roleTemplates, setRoleTemplates] = useState<Record<string, RoleTemplate>>({});
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [activity, setActivity] = useState<AuditActivity[]>([]);
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

  // Custom role creation state
  const [customRoleModalOpen, setCustomRoleModalOpen] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [newRoleModules, setNewRoleModules] = useState<string[]>([]);
  const [newRoleReason, setNewRoleReason] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [customRoleError, setCustomRoleError] = useState("");

  // Edit/Action state
  const [actionBusyUid, setActionBusyUid] = useState<string | null>(null);
  const [teamActionConfirm, setTeamActionConfirm] = useState<{ member: TeamMember; action: "suspend" | "revoke" } | null>(null);

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
      setActivity(data.activity || []);
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

  const toggleNewRoleModule = (mod: string) => {
    setNewRoleModules((prev) =>
      prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod],
    );
  };

  const handleInviteSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!account.isOwner) {
      setInviteError("Only the platform owner can assign or delegate roles.");
      return;
    }
    if (!inviteEmail.trim() || selectedModules.length === 0 || !inviteReason.trim()) {
      setInviteError("Please enter email, choose at least one permission, and provide a valid reason.");
      return;
    }

    setInviting(true);
    setInviteError("");
    try {
      const headers = await requestZillionaireStepUp("team_manage", inviteReason.trim());
      headers.set("Authorization", (await getWebAuthHeaders(token)).get("Authorization") || "");
      const res = await fetch("/api/public/v1/zillionaire/team", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "invite",
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

  const handleCreateCustomRole = async (e: FormEvent) => {
    e.preventDefault();
    if (!account.isOwner) {
      setCustomRoleError("Only the platform owner can create new custom roles.");
      return;
    }
    if (!newRoleName.trim() || newRoleModules.length === 0 || !newRoleReason.trim()) {
      setCustomRoleError("Please enter role name, pick at least one permission, and give a reason.");
      return;
    }

    setCreatingRole(true);
    setCustomRoleError("");
    try {
      const headers = await requestZillionaireStepUp("team_manage", newRoleReason.trim());
      headers.set("Authorization", (await getWebAuthHeaders(token)).get("Authorization") || "");
      const res = await fetch("/api/public/v1/zillionaire/team", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create_role",
          roleName: newRoleName.trim(),
          description: newRoleDescription.trim(),
          modules: newRoleModules,
          reason: newRoleReason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create role template");

      setSuccessMessage(`Custom role "${newRoleName.trim()}" created successfully.`);
      setCustomRoleModalOpen(false);
      setNewRoleName("");
      setNewRoleDescription("");
      setNewRoleModules([]);
      setNewRoleReason("");
      void fetchTeam();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setCustomRoleError(err instanceof Error ? err.message : "Error creating role");
    } finally {
      setCreatingRole(false);
    }
  };

  const handleToggleSuspend = (member: TeamMember) => {
    if (!account.isOwner) return;
    setTeamActionConfirm({ member, action: "suspend" });
  };

  const handleRevoke = (member: TeamMember) => {
    if (!account.isOwner) return;
    setTeamActionConfirm({ member, action: "revoke" });
  };

  const confirmTeamActionExecution = async () => {
    if (!teamActionConfirm || !account.isOwner) return;
    const { member, action } = teamActionConfirm;
    setActionBusyUid(member.uid);
    try {
      if (action === "suspend") {
        const nextStatus = member.status === "suspended" ? "active" : "suspended";
        const headers = await requestZillionaireStepUp(
          "team_manage",
          `Change access for ${member.email}`,
        );
        headers.set("Authorization", (await getWebAuthHeaders(token)).get("Authorization") || "");
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
      } else {
        const headers = await requestZillionaireStepUp(
          "team_manage",
          `Revoke access for ${member.email}`,
        );
        headers.set("Authorization", (await getWebAuthHeaders(token)).get("Authorization") || "");
        const res = await fetch(`/api/public/v1/zillionaire/team/${member.uid}`, {
          method: "DELETE",
          headers,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to revoke member permissions");
        setSuccessMessage(`All permissions revoked for ${member.email}.`);
      }
      setTeamActionConfirm(null);
      void fetchTeam();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error updating permissions");
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
      return days > 0 && days <= 7;
    }).length;

    return { total, active, suspended, expiringSoon };
  }, [members]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      account={account}
      onLock={onLock}
      title="Team & Roles Control"
      subtitle="Expose all dashboard jobs as selectable permissions, assign staff, enforce expiry, and review audited activity."
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Role Governance & Least Privilege"
          description="Grant staff granular access across dashboard jobs. Only the platform owner can create roles or modify team assignments. Delegated team members cannot change their own roles or others'."
          actionLabel={account.isOwner ? "Delegate Access" : undefined}
          onAction={account.isOwner ? () => setInviteModalOpen(true) : undefined}
          icon={ShieldCheck}
        />

        {!account.isOwner && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3 text-amber-200">
            <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-amber-300">Delegated Team View (Read-Only)</p>
              <p className="text-amber-200/80 mt-0.5">
                People with a delegated role cannot change their own role or anyone else's. Only the platform owner can create roles, assign members, or revoke access.
              </p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-xl p-4 flex items-center gap-3 text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex items-center gap-3 text-red-200">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <ConsoleKpiCard
            title="Total Delegated"
            value={kpis.total}
            subtitle="Staff with platform jobs"
            icon={Users}
            tone="brand"
          />
          <ConsoleKpiCard
            title="Active Operators"
            value={kpis.active}
            subtitle="Operational accounts"
            icon={UserCheck}
            tone="success"
          />
          <ConsoleKpiCard
            title="Suspended"
            value={kpis.suspended}
            subtitle="Access blocked"
            icon={UserX}
            tone={kpis.suspended > 0 ? "danger" : "neutral"}
          />
          <ConsoleKpiCard
            title="Expiring Soon"
            value={kpis.expiringSoon}
            subtitle="Within next 7 days"
            icon={Clock}
            tone={kpis.expiringSoon > 0 ? "warning" : "neutral"}
          />
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-2">
          <button
            onClick={() => setActiveTab("members")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "members"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            Team Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab("roles")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "roles"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Layers className="w-4 h-4" />
            Roles & Permissions ({Object.keys(roleTemplates).length})
          </button>
          <button
            onClick={() => setActiveTab("activity")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === "activity"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <History className="w-4 h-4" />
            Activity & Audit ({activity.length})
          </button>
        </div>

        {/* TAB 1: MEMBERS */}
        {activeTab === "members" && (
          <ConsoleCard
            title="Staff & Role Assignments"
            subtitle="Active operators and their delegated dashboard job scopes"
            actionLabel={account.isOwner ? "Delegate Role" : undefined}
            onAction={account.isOwner ? () => setInviteModalOpen(true) : undefined}
          >
            <ConsoleTable
              columns={[
                { key: "email", label: "Operator Email" },
                { key: "role", label: "Assigned Role" },
                { key: "permissions", label: "Job Permissions" },
                { key: "status", label: "Account Status" },
                { key: "expiry", label: "Expiry Date" },
                { key: "actions", label: "Actions", align: "right" },
              ]}
              rows={members.map((member) => ({
                id: member.uid,
                email: (
                  <div>
                    <div className="font-medium text-white">{member.email}</div>
                    <div className="text-xs text-zinc-500 font-mono mt-0.5">{member.uid}</div>
                  </div>
                ),
                role: (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {roleTemplates[member.roleTemplate]?.label || member.roleName || member.roleTemplate}
                  </span>
                ),
                permissions: (
                  <div className="flex flex-wrap gap-1 max-w-md">
                    {member.modules.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ),
                status: (
                  <ConsoleStatusBadge
                    status={member.status === "active" ? "active" : "failed"}
                    label={member.status.toUpperCase()}
                  />
                ),
                expiry: member.expiryDate ? (
                  <span
                    className={`text-xs ${
                      new Date(member.expiryDate).getTime() < Date.now()
                        ? "text-red-400 font-semibold"
                        : "text-zinc-400"
                    }`}
                  >
                    {new Date(member.expiryDate).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">No Expiry</span>
                ),
                actions: account.isOwner ? (
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => handleToggleSuspend(member)}
                      disabled={actionBusyUid === member.uid}
                      className="px-2 py-1 text-xs font-medium rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50"
                    >
                      {member.status === "suspended" ? "Activate" : "Suspend"}
                    </button>
                    <button
                      onClick={() => handleRevoke(member)}
                      disabled={actionBusyUid === member.uid}
                      className="p-1 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                      title="Revoke permissions"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-zinc-600">Protected</span>
                ),
              }))}
              emptyMessage={loading ? "Loading team members..." : "No team members assigned yet."}
            />
          </ConsoleCard>
        )}

        {/* TAB 2: ROLES & PERMISSIONS */}
        {activeTab === "roles" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-white">Dashboard Roles & Job Templates</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Pre-configured job roles and custom templates built from the 17 dashboard permissions.
                </p>
              </div>
              {account.isOwner && (
                <button
                  onClick={() => setCustomRoleModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-semibold text-xs flex items-center gap-1.5 hover:bg-amber-400 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Create Custom Role
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(roleTemplates).map(([key, tpl]) => (
                <div
                  key={key}
                  className="bg-zinc-900/60 border border-white/10 rounded-xl p-4 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white text-sm">{tpl.label}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {tpl.modules.length} jobs
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">{tpl.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {tpl.modules.map((m) => (
                        <span
                          key={m}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700/60"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-sm font-semibold text-white mb-2">
                All 17 Selectable Dashboard Job Permissions
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {DASHBOARD_PERMISSIONS.map((perm) => (
                  <div
                    key={perm.id}
                    className="p-3 rounded-lg bg-zinc-950/60 border border-white/5 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-amber-300">{perm.label}</span>
                      <span className="text-[9px] font-mono uppercase px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">
                        {perm.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400">{perm.description}</p>
                    <div className="text-[10px] font-mono text-zinc-500">module: {perm.module}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT & ACTIVITY */}
        {activeTab === "activity" && (
          <ConsoleCard
            title="Team Activity & Audit Trail"
            subtitle="The owner can inspect everything team members did across the platform"
          >
            <ConsoleTable
              columns={[
                { key: "time", label: "Timestamp" },
                { key: "actor", label: "Actor UID" },
                { key: "action", label: "Action" },
                { key: "target", label: "Target" },
                { key: "reason", label: "Justification Reason" },
              ]}
              rows={activity.map((act) => ({
                id: act.id,
                time: (
                  <span className="text-xs text-zinc-400 font-mono">
                    {new Date(act.createdAt).toLocaleString()}
                  </span>
                ),
                actor: (
                  <span className="text-xs font-mono text-amber-300">
                    {act.actorUid ? act.actorUid.slice(0, 16) : "system"}
                  </span>
                ),
                action: (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-200 border border-zinc-700">
                    {act.action}
                  </span>
                ),
                target: (
                  <span className="text-xs text-zinc-400 font-mono">
                    {act.targetType || "—"}: {act.targetId || "—"}
                  </span>
                ),
                reason: <span className="text-xs text-zinc-300">{act.reason || "—"}</span>,
              }))}
              emptyMessage="No recent audited team actions."
            />
          </ConsoleCard>
        )}

        {/* INVITE / DELEGATE MODAL */}
        {inviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Delegate Platform Role</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Select permissions across all dashboard jobs and assign an expiry date.
                  </p>
                </div>
                <button
                  onClick={() => setInviteModalOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {inviteError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-red-200 text-xs">
                  {inviteError}
                </div>
              )}

              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Staff Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="operator@bqsqwad.tv"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Job Role Template
                  </label>
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {Object.entries(roleTemplates).map(([k, tpl]) => (
                      <option key={k} value={k}>
                        {tpl.label}
                      </option>
                    ))}
                    <option value="custom">Custom Permissions Selection</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Selectable Dashboard Permissions ({selectedModules.length} selected) *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-2 bg-black/40 rounded-lg border border-white/5">
                    {DASHBOARD_PERMISSIONS.map((perm) => {
                      const isChecked = selectedModules.includes(perm.module);
                      return (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                              : "bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/10"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleModule(perm.module)}
                            className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
                          />
                          <div>
                            <div className="text-xs font-semibold leading-tight">{perm.label}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">
                              {perm.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Role Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={inviteExpiry}
                      onChange={(e) => setInviteExpiry(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Audit Reason *
                    </label>
                    <input
                      type="text"
                      required
                      value={inviteReason}
                      onChange={(e) => setInviteReason(e.target.value)}
                      placeholder="e.g. Delegating live ops lead for Q3 festival"
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setInviteModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    {inviting ? "Granting Role..." : "Grant Role & Expiry"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CUSTOM ROLE CREATION MODAL */}
        {teamActionConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1435] p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="font-bold text-rose-400 text-sm">
                  {teamActionConfirm.action === "suspend"
                    ? `${teamActionConfirm.member.status === "suspended" ? "Reactivate" : "Suspend"} Member Access`
                    : "Revoke Member Permissions"}
                </h3>
                <button onClick={() => setTeamActionConfirm(null)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-blue-100/70 leading-relaxed">
                {teamActionConfirm.action === "suspend"
                  ? `Are you sure you want to ${teamActionConfirm.member.status === "suspended" ? "reactivate" : "suspend"} console access for ${teamActionConfirm.member.email}?`
                  : `Revoke all delegated security and operations permissions for ${teamActionConfirm.member.email}? This action is immediate and will be logged.`}
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setTeamActionConfirm(null)}
                  className="rounded-xl border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-blue-200/70 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionBusyUid === teamActionConfirm.member.uid}
                  onClick={confirmTeamActionExecution}
                  className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {actionBusyUid === teamActionConfirm.member.uid ? "Processing..." : "Confirm Action"}
                </button>
              </div>
            </div>
          </div>
        )}

        {customRoleModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Create Custom Role Template</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Define a reusable job bundle with specific dashboard permissions.
                  </p>
                </div>
                <button
                  onClick={() => setCustomRoleModalOpen(false)}
                  className="text-zinc-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {customRoleError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-red-200 text-xs">
                  {customRoleError}
                </div>
              )}

              <form onSubmit={handleCreateCustomRole} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Role Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="e.g. Broadcast Operations Supervisor"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newRoleDescription}
                    onChange={(e) => setNewRoleDescription(e.target.value)}
                    placeholder="Scope of responsibilities and authorization envelope"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Included Dashboard Permissions ({newRoleModules.length} selected) *
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-56 overflow-y-auto p-2 bg-black/40 rounded-lg border border-white/5">
                    {DASHBOARD_PERMISSIONS.map((perm) => {
                      const isChecked = newRoleModules.includes(perm.module);
                      return (
                        <label
                          key={perm.id}
                          className={`flex items-start gap-2 p-2 rounded border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                              : "bg-zinc-900/40 border-white/5 text-zinc-400 hover:border-white/10"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleNewRoleModule(perm.module)}
                            className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
                          />
                          <div>
                            <div className="text-xs font-semibold leading-tight">{perm.label}</div>
                            <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-1">
                              {perm.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">
                    Audit Reason *
                  </label>
                  <input
                    type="text"
                    required
                    value={newRoleReason}
                    onChange={(e) => setNewRoleReason(e.target.value)}
                    placeholder="Reason for role creation"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setCustomRoleModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingRole}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
                  >
                    {creatingRole ? "Saving Role..." : "Save Custom Role"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
