import { Button } from "@/components/ui/button";
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
  UserPlus,
  ShieldCheck,
  UploadCloud,
  BarChart3,
  MessageSquare,
  Handshake,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { PRODUCER_SCOPES, type ProducerScope } from "@/lib/team-types";

export const Route = createFileRoute("/producer/team")({
  component: ProducerTeamRoute,
  head: () => ({
    meta: [
      { title: "Producer Team & Scopes | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface ProducerTeamMember {
  id: string;
  email: string;
  name: string;
  scopes: ProducerScope[];
  status: string;
  expiresAt: string | null;
  createdAt: string | null;
}

function ProducerTeamRoute() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account }) => <ProducerTeamContent token={token} account={account} />}
    </ConsolePageGuard>
  );
}

function ProducerTeamContent({
  token,
  account,
}: {
  token: string;
  account: { email: string | null };
}) {
  const [members, setMembers] = useState<ProducerTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  // Add modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ProducerScope[]>(["upload", "analytics"]);
  const [expiresAt, setExpiresAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProducerTeamMember | null>(null);

  const fetchMembers = async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getWebAuthHeaders(token);
      const res = await fetch("/api/public/v1/producer/team", { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load producer team");
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

  const toggleScope = (scope: ProducerScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
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
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/producer/team", {
        method: "POST",
        headers,
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim() || undefined,
          scopes: selectedScopes,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add member");

      setSuccessMessage(`Team member ${email} added successfully.`);
      setModalOpen(false);
      setEmail("");
      setName("");
      setSelectedScopes(["upload", "analytics"]);
      setExpiresAt("");
      setReason("");
      void fetchMembers();
      setTimeout(() => setSuccessMessage(""), 5000);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Error adding member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleSuspend = async (member: ProducerTeamMember) => {
    const nextStatus = member.status === "suspended" ? "active" : "suspended";
    setBusyMemberId(member.id);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/producer/team", {
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

  const handleRemove = (member: ProducerTeamMember) => {
    setMemberToRemove(member);
  };

  const confirmRemove = async () => {
    if (!memberToRemove) return;
    const member = memberToRemove;
    setBusyMemberId(member.id);
    try {
      const headers = await getWebAuthHeaders(token);
      headers["Content-Type"] = "application/json";
      const res = await fetch("/api/public/v1/producer/team", {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          memberId: member.id,
          reason: "Manual member removal by studio owner",
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
    const uploaderCount = members.filter((m) => m.scopes.includes("upload")).length;
    const collabCount = members.filter((m) => m.scopes.includes("collaboration")).length;
    return { total, active, uploaderCount, collabCount };
  }, [members]);

  return (
    <ConsoleShell
      consoleType="producer"
      account={account}
      title="Studio Team & Access Scopes"
      tagline="Delegate scoped access to collaborators for uploading, analytics, comments, and collaboration."
    >
      <div className="space-y-6">
        <ConsoleWelcomeBanner
          title="Studio Team Delegation"
          description="Grant team members precise scopes (upload, analytics, comments, collaboration). Each collaborator sees only your studio's content and metrics."
          actionLabel="Add Studio Member"
          onAction={() => setModalOpen(true)}
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
            subtitle="Studio personnel"
            icon={Users}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Active"
            value={kpis.active}
            subtitle="Operational access"
            icon={ShieldCheck}
            variant="green"
          />
          <ConsoleKpiCard
            title="Upload Operators"
            value={kpis.uploaderCount}
            subtitle="Can upload media"
            icon={UploadCloud}
            variant="blue"
          />
          <ConsoleKpiCard
            title="Collab Managers"
            value={kpis.collabCount}
            subtitle="Can manage splits"
            icon={Handshake}
            variant="blue"
          />
        </div>

        {/* Team Table */}
        <ConsoleCard
          title="Studio Team Members"
          subtitle="Scoped permissions for your studio assets"
          headerAction={
            <Button type="button" onClick={() => setModalOpen(true)}>Add Member</Button>
          }
        >
          <ConsoleTable
            columns={[
              { key: "member", label: "Team Member" },
              { key: "scopes", label: "Granted Scopes" },
              { key: "status", label: "Status" },
              { key: "expiry", label: "Expiry" },
              { key: "actions", label: "Actions", className: "text-right" },
            ]}
            data={members.map((m) => ({
              id: m.id,
              member: (
                <div>
                  <div className="font-medium text-white">{m.name || m.email}</div>
                  <div className="text-xs text-zinc-500">{m.email}</div>
                </div>
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
            emptyTitle={loading ? "Loading team members..." : "No studio team members added yet."}
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
                Remove <strong>{memberToRemove.email}</strong> from your studio team? They will immediately lose access to all channels, assets, and analytics.
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
                  <h3 className="text-lg font-bold text-white">Add Studio Team Member</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Select the scopes this collaborator is authorized to manage.
                  </p>
                </div>
                <button onClick={() => setModalOpen(false)} className="text-zinc-400 hover:text-white">
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
                    placeholder="editor@studio.com"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name (Optional)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-2">
                    Authorized Scopes ({selectedScopes.length} selected) *
                  </label>
                  <div className="space-y-2">
                    {PRODUCER_SCOPES.map((scope) => {
                      const isChecked = selectedScopes.includes(scope.id);
                      return (
                        <label
                          key={scope.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            isChecked
                              ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                              : "bg-black/40 border-white/5 text-zinc-400 hover:border-white/10"
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
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1">Reason *</label>
                    <input
                      type="text"
                      required
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Video editor for Season 2"
                      className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
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
