import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, LogOut, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";

type TeamRole = "co-owner" | "manager" | "scheduler" | "uploader" | "moderator" | "analyst" | "finance";
type TeamMember = { uid: string; role: TeamRole; permissions: string[]; status: string; expiresAt: string | null };

export const Route = createFileRoute("/producer/channels/$channelId/team")({
  component: ChannelTeamPage,
  head: () => ({ meta: [{ title: "Channel team | BQ SQWAD TV" }] }),
});

const roles: Array<{ value: TeamRole; label: string }> = [
  { value: "co-owner", label: "Co-owner" },
  { value: "manager", label: "Manager" },
  { value: "scheduler", label: "Scheduler" },
  { value: "uploader", label: "Uploader" },
  { value: "moderator", label: "Moderator" },
  { value: "analyst", label: "Analyst" },
  { value: "finance", label: "Finance" },
];

function ChannelTeamPage() {
  const { channelId } = Route.useParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [memberUid, setMemberUid] = useState("");
  const [role, setRole] = useState<TeamRole>("uploader");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function request(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(await getWebAuthHeaders(token)),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    const result = await response.json() as { error?: string; [key: string]: unknown };
    if (!response.ok) throw new Error(result.error ?? "The team request failed.");
    return result;
  }

  async function loadMembers() {
    const result = await request("/api/public/v1/producer/channels/" + encodeURIComponent(channelId) + "/team");
    setMembers(Array.isArray(result) ? result as unknown as TeamMember[] : []);
  }

  useEffect(() => {
    if (token) void loadMembers().catch(caught => setError(caught instanceof Error ? caught.message : "Could not load team."));
  }, [token]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setToken(result.idToken);
      setEmail(result.email);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      setPassword("");
    } finally { setBusy(false); }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/api/public/v1/producer/channels/" + encodeURIComponent(channelId) + "/team", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberUid: memberUid.trim(), role, reason: reason.trim() }),
      });
      setMemberUid("");
      setReason("");
      setMessage("Team access saved. The server will enforce the selected role and permissions.");
      await loadMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save team access.");
    } finally { setBusy(false); }
  }

  async function removeMember(uid: string) {
    const removalReason = window.prompt("Reason for removing this team member:");
    if (!removalReason?.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await request("/api/public/v1/producer/channels/" + encodeURIComponent(channelId) + "/team", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memberUid: uid, reason: removalReason.trim() }),
      });
      setMessage("Team member access removed.");
      await loadMembers();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove team member.");
    } finally { setBusy(false); }
  }

  function signOut() {
    setToken("");
    setMembers([]);
    setPassword("");
    setMessage("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/producer/channels" className="inline-flex items-center gap-2 text-sm font-bold text-cyan-200"><ArrowLeft size={16} /> Producer channels</a>
          {token ? <button onClick={signOut} className="inline-flex items-center gap-2 text-sm text-blue-100/70"><LogOut size={16} /> Sign out</button> : null}
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><Users size={16} /> Channel team</p>
        <h1 className="mt-3 text-3xl font-black">Team access</h1>
        <p className="mt-2 break-all text-xs text-blue-100/45">Channel {channelId}</p>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100/60">Invite an existing BQ SQWAD TV account using its Firebase user ID. Channel ownership cannot be assigned through team membership. Access is checked on every protected API request.</p>

        {!token ? (
          <form onSubmit={signIn} className="mt-8 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Producer sign in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">Current members</h2><span className="text-xs text-cyan-200">{members.length} shown</span></div>
              {members.length ? <div className="mt-4 divide-y divide-white/10">
                {members.map(member => <article key={member.uid} className="flex items-center justify-between gap-3 py-4">
                  <div className="min-w-0"><p className="break-all text-sm font-semibold">{member.uid}</p><p className="mt-1 text-xs capitalize text-blue-100/55">{member.role} · {member.status.toLowerCase()}</p><p className="mt-1 text-[11px] text-blue-100/35">{member.permissions.length} permissions{member.expiresAt ? " · expires " + new Date(member.expiresAt).toLocaleDateString() : ""}</p></div>
                  <button disabled={busy} onClick={() => void removeMember(member.uid)} aria-label={"Remove " + member.uid} className="rounded-lg border border-rose-300/20 p-2 text-rose-200 hover:bg-rose-300/10 disabled:opacity-50"><X size={16} /></button>
                </article>)}
              </div> : <p className="mt-5 text-sm text-blue-100/50">No team members are assigned yet.</p>}
            </section>
            <form onSubmit={addMember} className="grid content-start gap-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-[#0b2057] to-[#07143d] p-6">
              <div><h2 className="text-xl font-bold">Add or update member</h2><p className="mt-1 text-xs text-blue-100/55">The server restricts which roles each manager may grant.</p></div>
              <label className="grid gap-2 text-sm text-blue-100/70">Firebase user ID<input required minLength={20} maxLength={128} value={memberUid} onChange={event => setMemberUid(event.target.value.trim())} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Team role<select value={role} onChange={event => setRole(event.target.value as TeamRole)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white">{roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="grid gap-2 text-sm text-blue-100/70">Reason for access change<textarea required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} rows={3} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
              {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
              {message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
              <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <UserPlus size={17} />} Save team access</button>
              <p className="flex items-start gap-2 text-[11px] leading-5 text-blue-100/40"><ShieldCheck size={14} className="mt-0.5 shrink-0" /> Permissions are limited to the selected role template. Higher-risk access requires the channel owner.</p>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
