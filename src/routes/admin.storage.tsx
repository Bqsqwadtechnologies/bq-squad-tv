import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Database, LoaderCircle, ShieldCheck } from "lucide-react";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/admin/storage")({
  component: AdminStoragePage,
  head: () => ({ meta: [{ title: "Storage locations | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});

type Destination = {
  destinationId: string;
  providerType: "lovable_storage" | "backblaze_b2";
  accountAlias: string;
  secretPrefix: string;
  bucketName: string;
  region: string;
  purpose: string;
  softCapBytes: number;
  dailyEgressCapBytes: number | null;
  priority: number;
  enabled: boolean;
  accountGroup: string;
  mode: "active" | "drain" | "retired";
  replicaOf: string | null;
  configurationStatus: "configured" | "misconfigured" | "disabled";
  missingSecretNames: string[];
  accountCapBytes?: number | null;
  usageBytes?: number | null;
  usageSource?: string | null;
  usageCheckedAt?: string | null;
  healthStatus?: "unknown" | "healthy" | "degraded" | "unreachable" | "misconfigured";
  healthCheckedAt?: string | null;
  egressMonthBytes?: number | null;
  egressLevel?: string | null;
  freeEgressBudgetBytes?: number | null;
  paidEgressEnabled?: boolean;
  egressAccountMonthBytes?: number | null;
};

const PURPOSES = ["source_media", "hls_streaming", "posters", "thumbnails", "downloads", "temporary", "backup", "producer_verification"];

function AdminStoragePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationId, setDestinationId] = useState("");
  const [providerType, setProviderType] = useState<Destination["providerType"]>("lovable_storage");
  const [accountAlias, setAccountAlias] = useState("");
  const [accountGroup, setAccountGroup] = useState("lovable-default-workspace");
  const [mode, setMode] = useState<Destination["mode"]>("active");
  const [replicaOf, setReplicaOf] = useState("");
  const [secretPrefix, setSecretPrefix] = useState("LOVABLE_STORAGE_01");
  const [bucketName, setBucketName] = useState("bq-sqwad-source-media");
  const [region, setRegion] = useState("africa-south1");
  const [purpose, setPurpose] = useState("source_media");
  const [softCapGb, setSoftCapGb] = useState("9");
  const [accountCapGb, setAccountCapGb] = useState("");
  const [dailyEgressGb, setDailyEgressGb] = useState("");
  const [monthlyEgressGb, setMonthlyEgressGb] = useState("");
  const [paidEgressEnabled, setPaidEgressEnabled] = useState(false);
  const [priority, setPriority] = useState("100");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadDestinations(idToken: string) {
    const response = await fetch("/api/public/v1/admin/storage/destinations", {
      headers: await getWebAuthHeaders(idToken),
      cache: "no-store",
    });
    const data = await response.json() as { destinations?: Destination[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load storage destinations.");
    setDestinations(data.destinations ?? []);
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setEmail(result.email);
      setPassword("");
      await loadDestinations(result.idToken);
      setToken(result.idToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Owner sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function checkHealth(item: Destination) {
    if (!token || busy) return;
    const reason = window.prompt("Why are you running this provider health check?");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError(""); setMessage("Running a private provider health check…");
    try {
      const response = await fetch("/api/public/v1/admin/storage/health", { method: "POST", headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" }, body: JSON.stringify({ destinationId: item.destinationId, reason: reason.trim() }) });
      const data = await response.json() as { healthStatus?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Provider health check failed.");
      await loadDestinations(token);
      setMessage("Provider health check: " + (data.healthStatus ?? "unknown") + ".");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Provider health check failed."); }
    finally { setBusy(false); }
  }

  async function recordUsage(item: Destination) {
    if (!token || busy) return;
    const raw = window.prompt("Enter the usage amount in bytes exactly as shown on the storage provider's report.");
    if (raw === null) return;
    const usageBytes = Number(raw);
    if (!Number.isSafeInteger(usageBytes) || usageBytes < 0) { setError("Usage must be a whole number of bytes from a provider usage report."); return; }
    const reason = window.prompt("Explain the source/date of this usage report for the audit log.");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError(""); setMessage("Saving owner-attested usage snapshot…");
    try {
      const response = await fetch("/api/public/v1/admin/storage/usage", { method: "POST", headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" }, body: JSON.stringify({ destinationId: item.destinationId, usageBytes, reason: reason.trim() }) });
      const data = await response.json() as { saved?: boolean; error?: string };
      if (!response.ok || !data.saved) throw new Error(data.error ?? "Usage snapshot could not be saved.");
      await loadDestinations(token); setMessage("Usage report saved as a manual entry. It has not been checked automatically.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Usage snapshot failed."); }
    finally { setBusy(false); }
  }

  async function seedLegacyBuckets() {
    if (!token || busy) return;
    const reason = window.prompt("Reason for registering the two existing legacy storage destinations?");
    if (!reason || reason.trim().length < 3) return;
    setBusy(true); setError(""); setMessage("Registering legacy destination metadata…");
    try {
      const destinations = [
        { destinationId: "legacy_lovable_source", providerType: "lovable_storage", accountAlias: "Legacy source media", secretPrefix: "SUPABASE", bucketName: "bq-sqwad-source-media", region: "africa-south1", purpose: "source_media", accountGroup: "lovable-default-workspace", mode: "active", replicaOf: null, softCapBytes: 5000000000, accountCapBytes: null, dailyEgressCapBytes: null, priority: 10, enabled: true, paidEgressEnabled: false, freeEgressBudgetBytes: null },
        { destinationId: "legacy_lovable_streaming", providerType: "lovable_storage", accountAlias: "Legacy streaming media", secretPrefix: "SUPABASE", bucketName: "bq-sqwad-streaming-media", region: "africa-south1", purpose: "hls_streaming", accountGroup: "lovable-default-workspace", mode: "active", replicaOf: null, softCapBytes: 5000000000, accountCapBytes: null, dailyEgressCapBytes: null, priority: 10, enabled: true, paidEgressEnabled: false, freeEgressBudgetBytes: null },
      ];
      const response = await fetch("/api/public/v1/admin/storage/seed", { method: "POST", headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" }, body: JSON.stringify({ reason: reason.trim(), destinations }) });
      const data = await response.json() as { created?: string[]; skipped?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Legacy metadata seed failed.");
      await loadDestinations(token); setMessage("Existing location records added. Created: " + (data.created ?? []).length + "; already present: " + (data.skipped ?? []).length + ". Connection and usage still need to be checked.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Legacy metadata seed failed."); }
    finally { setBusy(false); }
  }

  function editDestination(item: Destination) {
    setDestinationId(item.destinationId);
    setProviderType(item.providerType);
    setAccountAlias(item.accountAlias);
    setAccountGroup(item.accountGroup);
    setMode(item.mode);
    setReplicaOf(item.replicaOf ?? "");
    setSecretPrefix(item.secretPrefix);
    setBucketName(item.bucketName);
    setRegion(item.region);
    setPurpose(item.purpose);
    setSoftCapGb(String(item.softCapBytes / 1_000_000_000));
    setAccountCapGb(item.accountCapBytes == null ? "" : String(item.accountCapBytes / 1_000_000_000));
    setDailyEgressGb(item.dailyEgressCapBytes === null ? "" : String(item.dailyEgressCapBytes / 1_000_000_000));
    setMonthlyEgressGb(item.freeEgressBudgetBytes == null ? "" : String(item.freeEgressBudgetBytes / 1_000_000_000));
    setPaidEgressEnabled(item.paidEgressEnabled === true);
    setPriority(String(item.priority));
    setEnabled(item.enabled);
    setMessage("Editing " + item.destinationId + ". Save to update its non-secret metadata.");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const cap = Number(softCapGb);
      const egress = dailyEgressGb.trim() ? Number(dailyEgressGb) : null;
      const accountCap = accountCapGb.trim() ? Number(accountCapGb) : null;
      const monthlyEgress = monthlyEgressGb.trim() ? Number(monthlyEgressGb) : null;
      if (!Number.isFinite(cap) || cap <= 0 || (egress !== null && (!Number.isFinite(egress) || egress <= 0)) || (accountCap !== null && (!Number.isFinite(accountCap) || accountCap <= 0)) || (monthlyEgress !== null && (!Number.isFinite(monthlyEgress) || monthlyEgress < 0))) {
        throw new Error("Enter positive storage and optional egress limits in decimal GB.");
      }
      const payload = {
        destinationId, providerType, accountAlias, accountGroup, mode, replicaOf: replicaOf.trim() || null, secretPrefix, bucketName, region, purpose,
        softCapBytes: Math.floor(cap * 1_000_000_000),
        accountCapBytes: accountCap === null ? null : Math.floor(accountCap * 1_000_000_000),
        dailyEgressCapBytes: egress === null ? null : Math.floor(egress * 1_000_000_000),
        freeEgressBudgetBytes: monthlyEgress === null ? null : Math.floor(monthlyEgress * 1_000_000_000),
        paidEgressEnabled,
        priority: Number(priority), enabled,
      };
      const response = await fetch("/api/public/v1/admin/storage/destinations", {
        method: "PUT",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as { saved?: boolean; destination?: Destination; error?: string; note?: string };
      if (!response.ok || !data.saved) throw new Error(data.error ?? "Storage destination could not be saved.");
      await loadDestinations(token);
      setMessage("Destination saved. Configuration: " + (data.destination?.configurationStatus ?? "unknown") + ". " + (data.note ?? ""));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Storage destination could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <a href="/admin/" className="text-sm font-bold text-cyan-200">← {token ? "Dashboard" : "Dashboard"}</a>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Storage locations</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck size={16} /> Private storage settings</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">Storage locations</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">Manage existing private storage locations, connection checks, usage reports and shared account limits. Connection details must be added separately in secure hosting settings.</p>

        {!token ? (
          <form onSubmit={login} className="mt-8 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Protected owner sign-in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white" /></label>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Verifying…" : "Sign in"}</button>
          </form>
        ) : (
          <>
            <div className="mt-8 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-6 text-amber-100/80">
              Registering a location does not create it or move files. Enter usage exactly as shown in a provider report. A location can receive new files only after its connection, usage, shared capacity and transfer allowance have been checked.
            </div>
            <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
              <div className="grid content-start gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">Registered locations</h2><div className="flex gap-3"><button onClick={() => void seedLegacyBuckets()} disabled={busy} className="text-xs font-bold text-cyan-200">Add existing locations</button><button onClick={() => void loadDestinations(token)} disabled={busy} className="text-xs font-bold text-cyan-200">Refresh</button></div></div>
                {destinations.length === 0 ? <p className="rounded-2xl border border-white/10 bg-[#07143d] p-5 text-sm text-blue-100/55">No storage locations are registered yet.</p> : destinations.map(item => (
                  <article key={item.destinationId} className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-bold">{item.accountAlias}</h3><p className="mt-1 text-xs text-blue-100/55">{item.providerType === "lovable_storage" ? "Managed storage" : "Other storage service"}</p></div>
                      <span className={"rounded-full px-3 py-1 text-[10px] font-bold uppercase " + (item.configurationStatus === "configured" ? "bg-emerald-300/10 text-emerald-200" : "bg-amber-300/10 text-amber-200")}>{item.configurationStatus}</span>
                    </div>
                    <p className="mt-3 break-all text-xs text-blue-100/70">{item.region} · {item.purpose === "source_media" ? "Original videos" : item.purpose === "hls_streaming" ? "Streaming files" : item.purpose.replaceAll("_", " ")} · {item.mode === "active" ? "available" : item.mode === "drain" ? "no new files" : "retired"}</p>
                    <p className="mt-1 text-xs text-blue-100/45">Capacity limit {(item.softCapBytes / 1_000_000_000).toFixed(2)} GB · priority {item.priority} · {item.enabled ? "enabled" : "disabled"}</p>
                    <p className="mt-1 text-xs text-blue-100/55">Connection status: {item.healthStatus ?? "unknown"}{item.healthCheckedAt ? " · " + new Date(item.healthCheckedAt).toLocaleString() : ""} · Usage report: {item.usageBytes == null ? "unknown" : (item.usageBytes / 1_000_000_000).toFixed(2) + " GB"}{item.usageSource ? " (" + item.usageSource + ")" : ""}</p>
                    <p className="mt-1 text-xs text-blue-100/45">Shared capacity: {item.accountCapBytes == null ? "not configured" : (item.accountCapBytes / 1_000_000_000).toFixed(2) + " GB"} · Data transferred: {item.egressAccountMonthBytes == null ? "unknown" : (item.egressAccountMonthBytes / 1_000_000_000).toFixed(2) + " GB"} / {item.freeEgressBudgetBytes == null ? "budget unknown" : (item.freeEgressBudgetBytes / 1_000_000_000).toFixed(2) + " GB"} · {item.egressLevel ?? "unknown"}</p>
                    <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void checkHealth(item)} disabled={busy} className="rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200">Check connection</button><button onClick={() => void recordUsage(item)} disabled={busy} className="rounded-lg border border-white/15 px-3 py-2 text-xs font-bold text-blue-100">Add usage report</button></div>
                    {item.missingSecretNames.length > 0 ? <p className="mt-2 break-all text-xs text-amber-200">Connection details need attention.</p> : null}
                    <button onClick={() => editDestination(item)} className="mt-4 rounded-lg border border-cyan-300/25 px-3 py-2 text-xs font-bold text-cyan-200">Edit location details</button>
                  </article>
                ))}
              </div>
              <form onSubmit={save} className="grid content-start gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-5">
                <div className="flex items-center gap-2"><Database className="text-cyan-200" size={20} /><h2 className="text-xl font-bold">Register location</h2></div>
                <label className="grid gap-2 text-xs text-blue-100/70">Location reference<input required pattern="[a-z0-9][a-z0-9_-]{1,79}" value={destinationId} onChange={event => setDestinationId(event.target.value)} placeholder="lovable_source_01" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Storage service<select value={providerType} onChange={event => { const value = event.target.value as Destination["providerType"]; setProviderType(value); const prefix = value === "lovable_storage" ? "LOVABLE_STORAGE_01" : "STORAGE_B2_01"; setSecretPrefix(prefix); setAccountGroup(value === "lovable_storage" ? "lovable-default-workspace" : "b2:STORAGE_B2_01"); }} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white"><option value="lovable_storage">Managed storage</option><option value="backblaze_b2">Other storage service</option></select></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Display name<input required minLength={2} value={accountAlias} onChange={event => setAccountAlias(event.target.value)} placeholder="Lovable primary" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Shared storage account (use the same name for locations in one account)<input required minLength={2} maxLength={100} value={accountGroup} onChange={event => setAccountGroup(event.target.value)} placeholder="lovable-default-workspace or b2:account-01" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Availability<select value={mode} onChange={event => setMode(event.target.value as Destination["mode"])} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white"><option value="active">Available for new files</option><option value="drain">Keep existing files, stop new assignments</option><option value="retired">Unavailable</option></select></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Copy of location reference (optional)<input value={replicaOf} onChange={event => setReplicaOf(event.target.value)} placeholder="existing-destination-id" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Secure connection group<input required pattern="[A-Z][A-Z0-9_]{1,47}" value={secretPrefix} onChange={event => setSecretPrefix(event.target.value.toUpperCase())} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 font-mono text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Storage location name<input required value={bucketName} onChange={event => setBucketName(event.target.value)} placeholder="Main video storage" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Region<input required value={region} onChange={event => setRegion(event.target.value)} placeholder="us-west-004" className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Used for<select value={purpose} onChange={event => setPurpose(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white">{PURPOSES.map(value => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Location capacity limit (GB)<input required type="number" min="0.01" step="0.01" value={softCapGb} onChange={event => setSoftCapGb(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Shared account capacity limit (GB, optional; use the same value for all locations in one account)<input type="number" min="0.01" step="0.01" value={accountCapGb} onChange={event => setAccountCapGb(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Monthly data transfer allowance (GB; shared by all locations in the account)<input type="number" min="0" step="0.01" value={monthlyEgressGb} onChange={event => setMonthlyEgressGb(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="flex items-center gap-3 text-xs text-blue-100/70"><input type="checkbox" checked={paidEgressEnabled} onChange={event => setPaidEgressEnabled(event.target.checked)} /> Allow paid data transfer for this entire account</label>
                <label className="grid gap-2 text-xs text-blue-100/70">Daily data transfer limit (GB, optional)<input type="number" min="0.01" step="0.01" value={dailyEgressGb} onChange={event => setDailyEgressGb(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Priority (lower is preferred)<input required type="number" min="0" max="10000" value={priority} onChange={event => setPriority(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-3 py-3 text-white" /></label>
                <label className="flex items-center gap-3 text-xs text-blue-100/70"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enable this location</label>
                {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
                {message ? <p role="status" className="break-words text-xs leading-5 text-cyan-200">{message}</p> : null}
                <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : null} Save location</button>
              </form>
            </div>
            <div className="mt-7 rounded-2xl border border-white/10 bg-[#07143d] p-5 text-xs leading-6 text-blue-100/60">
              <h3 className="font-bold text-white">Connection settings</h3>
              <p className="mt-2">Managed storage connection details must be added in the secure hosting settings.</p>
              <p>Other storage service connection details must be added in the secure hosting settings.</p>
              <p className="mt-2">Never enter connection keys on this page or commit them to the project. Add connection details only in the secure hosting settings.</p>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
