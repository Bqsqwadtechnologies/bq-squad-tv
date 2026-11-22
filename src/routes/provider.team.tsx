import { useState, useEffect, useMemo, FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
  Radio,
  Calendar,
  Receipt,
  ShieldCheck,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowLeft,
  Briefcase,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { PROVIDER_SCOPES, PARTNER_ROLES, type ProviderScope, type PartnerRole } from "@/lib/team-types";

export const Route = createFileRoute("/provider/team")({
  component: ProviderTeamRoute,
  head: () => ({
    meta: [
      { title: "Provider Team & Access | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ProviderTeamMember {
  id: string;
  email: string;
  name: string;
  role?: PartnerRole;
  scopes: ProviderScope[];
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
}

function ProviderTeamRoute() {
  return (
    <ConsolePageGuard role="provider">
      {({ token, account }) => <ProviderTeamContent token={token} account={account} />}
    </ConsolePageGuard>
  );
}

function ProviderTeamContent({
  token,
  account,
}: {
  token: string;
  account: { email: string | null; providerId?: string | null };
}) {
  const [members, setMembers] = useState<ProviderTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Add modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"Manager" | "Editor" | "Viewer">("Editor");
  const [selectedScopes, setSelectedScopes] = useState<ProviderScope[]>(["channels", "schedule"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProviderTeamMember | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/provider/team", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load provider team");
      setMembers(data.members || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading team");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchMembers();
  }, [token]);

  const handleRoleChange = (newRole: "Manager" | "Editor" | "Viewer") => {
    setRole(newRole);
    const def = PARTNER_ROLES.find((r) => r.id === newRole);
    if (def) {
      setSelectedScopes([...def.defaultScopes]);
    }
  };

  const toggleScope = (scope: ProviderScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  };

  const handleDiscard = () => {
    setEmail("");
    setName("");
    setRole("Editor");
    setSelectedScopes(["channels", "schedule"]);
    setExpiresAt("");
    setReason("");
    setFormError("");
    setModalOpen(false);
  };

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || selectedScopes.length === 0 || !reason.trim()) {
      setFormError("Please enter email, choose at least one scope, and provide a reason.");
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/provider/team", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          role,
          scopes: selectedScopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add member");

      setSuccessMessage(`Team member ${email} added as ${role} successfully.`);
      handleDiscard();
      void fetchMembers();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error adding member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSuspend = async (member: ProviderTeamMember) => {
    const nextStatus = member.status === "suspended" ? "active" : "suspended";
    setBusyMemberId(member.id);
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/provider/team", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          memberId: member.id,
          status: nextStatus,
          reason: `Status toggled to ${nextStatus}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update member");
      setSuccessMessage(`Member ${member.email} set to ${nextStatus}.`);
      void fetchMembers();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error updating member");
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleRemove = (member: ProviderTeamMember) => {
    setMemberToRemove(member);
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    const member = memberToRemove;
    setBusyMemberId(member.id);
    try {
      const headers = await getWebAuthHeaders(token);
      headers.set("Content-Type", "application/json");
      const res = await fetch("/api/public/v1/provider/team", {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          memberId: member.id,
          reason: "Manual member removal by provider owner",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove member");
      setSuccessMessage(`Member ${member.email} removed.`);
      setMemberToRemove(null);
      void fetchMembers();
      setTimeout(() => setSuccessMessage(""), 4000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error removing member");
    } finally {
      setBusyMemberId(null);
    }
  };

  const kpis = useMemo(() => {
    const total = members.length;
    const active = members.filter((m) => m.status === "active").length;
    const managers = members.filter((m) => m.role === "Manager").length;
    const editors = members.filter((m) => (m.role || "Editor") === "Editor").length;
    return { total, active, managers, editors };
  }, [members]);

  return (
    <ConsoleShell
      consoleType="provider"
      account={account}
      title="Partner Team Governance"
      subtitle="Manage team members across Manager, Editor, and Viewer partner roles."
    >
      <div className="space-y-6">
        {/* Back navigation */}
        <div className="flex items-center justify-between">
          <Link
            to="/provider"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Console</span>
          </Link>
        </div>

        <ConsoleWelcomeBanner
          title="Partner Team Governance"
          description="Grant team members precise roles (Manager, Editor, Viewer). The first assigned company email is the account Owner."
          actionLabel="Add Team Member"
          onAction={() => setModalOpen(true)}
          icon={Users}
        />

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
            title="Total Members"
            value={kpis.total}
            subtitle="Partner team operators"
            icon={Users}
            tone="brand"
          />
          <ConsoleKpiCard
            title="Active"
            value={kpis.active}
            subtitle="Operational access"
            icon={ShieldCheck}
            tone="success"
          />
          <ConsoleKpiCard
            title="Managers"
            value={kpis.managers}
            subtitle="Full management role"
            icon={Briefcase}
            tone="neutral"
          />
          <ConsoleKpiCard
            title="Editors"
            value={kpis.editors}
            subtitle="Broadcast & EPG schedulers"
            icon={Calendar}
            tone="neutral"
          />
        </div>

        {/* Team Table */}
        <ConsoleCard
          title="Team Members & Roles"
          subtitle="Roles define operational responsibility: Owner (Primary), Manager, Editor, or Viewer."
        >
          <ConsoleTable
            columns={[
              { key: "member", label: "Team Member" },
              { key: "role", label: "Partner Role" },
              { key: "scopes", label: "Granted Scopes" },
              { key: "status", label: "Status" },
              { key: "expiry", label: "Expiry" },
              { key: "actions", label: "Actions", align: "right" },
            ]}
            rows={members.map((m) => ({
              id: m.id,
              member: (
                <div>
                  <div className="font-medium text-white">{m.name || m.email}</div>
                  <div className="text-xs text-zinc-500">{m.email}</div>
                </div>
              ),
              role: (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 uppercase tracking-wider font-mono">
                  {m.role || "Editor"}
                </span>
              ),
              scopes: (
                <div className="flex flex-wrap gap-1">
                  {m.scopes.map((s) => (
                    <span
                      key={s}
                      className="text-[10px] px-2 py-0.5 rounded font-mono uppercase bg-amber-500/10 text-amber-300 border border-amber-500/20"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              ),
              status: (
                <ConsoleStatusBadge
                  status={m.status === "active" ? "active" : "failed"}
                  label={m.status.toUpperCase()}
                />
              ),
              expiry: m.expiresAt ? (
                <span className="text-xs text-zinc-400 font-mono">
                  {new Date(m.expiresAt).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-xs text-zinc-500">Permanent</span>
              ),
              actions: (
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleToggleSuspend(m)}
                    disabled={busyMemberId === m.id}
                    className="px-2 py-1 text-xs font-medium rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    {m.status === "suspended" ? "Activate" : "Suspend"}
                  </button>
                  <button
                    onClick={() => handleRemove(m)}
                    disabled={busyMemberId === m.id}
                    className="p-1 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                    title="Remove member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ),
            }))}
            emptyMessage={loading ? "Loading team members..." : "No provider team members added yet."}
          />
        </ConsoleCard>

        {/* Modal */}
        {memberToRemove && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1435] p-5 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <h3 className="font-bold text-rose-400 text-sm">Remove Team Member</h3>
                <button onClick={() => setMemberToRemove(null)} className="text-blue-200/60 hover:text-white">✕</button>
              </div>
              <p className="text-xs text-blue-100/70 leading-relaxed">
                Remove <strong>{memberToRemove.email}</strong> from your provider organization team?
              </p>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setMemberToRemove(null)}
                  className="rounded-xl border border-white/10 px-3.5 py-1.5 text-xs font-semibold text-blue-200/70 hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busyMemberId === memberToRemove.id}
                  onClick={confirmRemove}
                  className="rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {busyMemberId === memberToRemove.id ? "Removing..." : "Remove Member"}
                </button>
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-zinc-900 border border-white/10 rounded-2xl max-w-lg w-full p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Add Partner Team Member</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Assign a corporate role (Manager, Editor, or Viewer) to your team operator.
                  </p>
                </div>
                <button onClick={handleDiscard} className="text-zinc-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {formError && (
                <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-red-200 text-xs">
                  {formError}
                </div>
              )}

              <form onSubmit={handleAddMember} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="broadcast@network.tv"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name (Optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Partner Role *</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as "Manager" | "Editor" | "Viewer")}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  >
                    <option value="Manager">Manager — Channels, EPG schedules, statements & team access</option>
                    <option value="Editor">Editor — Channels, live streams & broadcast schedules</option>
                    <option value="Viewer">Viewer — Read-only statements and feed monitoring</option>
                  </select>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Roles follow the company governance structure: Manager, Editor, or Viewer.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Authorized Scopes ({selectedScopes.length} selected) *
                  </label>
                  <div className="space-y-2">
                    {PROVIDER_SCOPES.map((scope) => {
                      const isChecked = selectedScopes.includes(scope.id);
                      return (
                        <label
                          key={scope.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                              : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleScope(scope.id)}
                            className="mt-0.5 rounded border-zinc-700 bg-zinc-800 text-amber-500 focus:ring-0"
                          />
                          <div>
                            <div className="text-xs font-semibold">{scope.label}</div>
                            <div className="text-[11px] text-zinc-400 mt-0.5">{scope.description}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">
                      Expiry Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Reason *</label>
                    <input
                      type="text"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Broadcast scheduler for weekend live feed"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-semibold text-black bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {submitting ? "Adding..." : "Add Member"}
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
