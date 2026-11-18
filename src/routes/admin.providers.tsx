import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { 
  ArrowLeft, Tv2, Radio, Plus, CheckCircle2, AlertTriangle, 
  Play, LoaderCircle, ShieldAlert, FileText, Send 
} from "lucide-react";
import { restoreWebSession } from "@/lib/firebase-web-auth";

type Provider = {
  id: string;
  name: string;
  contactEmail: string;
  settlementCurrency: string;
  providerShareBps: number;
  status: string;
};

type LiveChannel = {
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
};

export const Route = createFileRoute("/admin/providers")({
  component: AdminProvidersPage,
  head: () => ({
    meta: [
      { title: "Providers & Live Channels | Dashboard" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function AdminProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [channels, setChannels] = useState<LiveChannel[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");

  // New provider modal state
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [pName, setPName] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pCurrency, setPCurrency] = useState("NGN");
  const [pShareBps, setPShareBps] = useState(2500);

  // New channel modal state
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [cProviderId, setCProviderId] = useState("");
  const [cName, setCName] = useState("");
  const [cStreamUrl, setCStreamUrl] = useState("");
  const [cCategory, setCCategory] = useState("Sports");
  const [cExpiry, setCExpiry] = useState("");

  // Testing playback
  const [testingId, setTestingId] = useState<string | null>(null);

  async function loadData(idToken: string) {
    try {
      const [resP, resC] = await Promise.all([
        fetch("/api/public/v1/admin/providers/", { headers: { Authorization: `Bearer ${idToken}` } }),
        fetch("/api/public/v1/admin/providers/channels", { headers: { Authorization: `Bearer ${idToken}` } }),
      ]);
      if (resP.ok) {
        const dataP = await resP.json() as { providers: Provider[] };
        setProviders(dataP.providers || []);
      }
      if (resC.ok) {
        const dataC = await resC.json() as { channels: LiveChannel[] };
        setChannels(dataC.channels || []);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      const tokenStr = await restoreWebSession();
      if (!active) return;
      if (tokenStr) {
        setToken(tokenStr);
        void loadData(tokenStr);
      } else {
        setError("Sign in with owner credentials required.");
        setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function handleAddProvider(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch("/api/public/v1/admin/providers/", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: pName,
          contactEmail: pEmail,
          settlementCurrency: pCurrency,
          providerShareBps: pShareBps,
        }),
      });
      if (!res.ok) throw new Error("Failed to register provider");
      setShowNewProvider(false);
      setPName("");
      setPEmail("");
      await loadData(token);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error adding provider");
    }
  }

  async function handleAddChannel(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    try {
      const res = await fetch("/api/public/v1/admin/providers/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          providerId: cProviderId,
          name: cName,
          streamUrl: cStreamUrl,
          categories: [cCategory],
          licenceExpiresAt: cExpiry ? new Date(cExpiry).toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create live channel");
      setShowNewChannel(false);
      setCName("");
      setCStreamUrl("");
      await loadData(token);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error adding channel");
    }
  }

  async function runPlaybackTest(channelId: string) {
    if (!token) return;
    setTestingId(channelId);
    try {
      const res = await fetch("/api/public/v1/admin/providers/test-playback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json() as { ok: boolean; message: string };
      alert(data.message);
      await loadData(token);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Test failed");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900" aria-label="Back to administration dashboard">
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <h1 className="font-bold text-lg text-white">Providers & Live TV Management</h1>
          </div>
          <Link to="/admin" className="text-xs text-cyan-400 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full space-y-8">
        {busy ? (
          <div className="py-24 text-center">
            <LoaderCircle className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
            <p className="text-sm text-slate-400">Loading channels and providers...</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        ) : (
          <>
            {/* Providers Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Licensed Content Providers</h2>
                  <p className="text-xs text-slate-400">Channel organisations operating under gross profit share agreements.</p>
                </div>
                <button
                  onClick={() => setShowNewProvider(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Provider
                </button>
              </div>

              {showNewProvider && (
                <form onSubmit={handleAddProvider} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-white">Register Channel Provider Organisation</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Company / Brand Name</label>
                      <input
                        type="text"
                        required
                        value={pName}
                        onChange={(e) => setPName(e.target.value)}
                        placeholder="e.g. Apex Sports Network"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Representative Email</label>
                      <input
                        type="email"
                        required
                        value={pEmail}
                        onChange={(e) => setPEmail(e.target.value)}
                        placeholder="rep@provider.com"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Settlement Currency</label>
                      <select
                        value={pCurrency}
                        onChange={(e) => setPCurrency(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="NGN">NGN (Naira)</option>
                        <option value="USD">USD (Dollar)</option>
                        <option value="GBP">GBP (Pound)</option>
                        <option value="EUR">EUR (Euro)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Gross Profit Share (BPS)</label>
                      <input
                        type="number"
                        value={pShareBps}
                        onChange={(e) => setPShareBps(Number(e.target.value))}
                        placeholder="2500 (25%)"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-cyan-600 text-white text-xs font-medium">Save Provider</button>
                    <button type="button" onClick={() => setShowNewProvider(false)} className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs">Cancel</button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {providers.map((p) => (
                  <div key={p.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="flex items-start justify-between">
                      <h4 className="font-semibold text-sm text-white">{p.name}</h4>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-medium">{p.status}</span>
                    </div>
                    <div className="mt-2 text-xs text-slate-400 space-y-1">
                      <div>Contact: <span className="text-slate-300">{p.contactEmail}</span></div>
                      <div>Share: <span className="text-cyan-400 font-semibold">{(p.providerShareBps / 100).toFixed(1)}%</span> of Net Gross Profit</div>
                      <div>Currency: <span className="text-slate-200">{p.settlementCurrency}</span></div>
                    </div>
                  </div>
                ))}
                {providers.length === 0 && (
                  <div className="col-span-3 p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400">
                    No providers registered yet. Tap "Add Provider" above to create one.
                  </div>
                )}
              </div>
            </section>

            {/* Live Channels Section */}
            <section className="space-y-4 pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Broadcast Channels</h2>
                  <p className="text-xs text-slate-400">Channels must pass a test playback before being published to viewers.</p>
                </div>
                <button
                  onClick={() => setShowNewChannel(true)}
                  disabled={providers.length === 0}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Live Channel
                </button>
              </div>

              {showNewChannel && (
                <form onSubmit={handleAddChannel} className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-bold text-white">Create New Live Stream Channel</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Provider Organisation</label>
                      <select
                        required
                        value={cProviderId}
                        onChange={(e) => setCProviderId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="">Select Provider...</option>
                        {providers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Channel Name</label>
                      <input
                        type="text"
                        required
                        value={cName}
                        onChange={(e) => setCName(e.target.value)}
                        placeholder="e.g. BQ Sports 1"
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                      <select
                        value={cCategory}
                        onChange={(e) => setCCategory(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      >
                        <option value="Sports">Sports</option>
                        <option value="News">News</option>
                        <option value="Movies">Movies</option>
                        <option value="Kids">Kids</option>
                        <option value="General">General</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Licence Expiration Date</label>
                      <input
                        type="date"
                        value={cExpiry}
                        onChange={(e) => setCExpiry(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Provider Stream URL (HLS / Manifest)</label>
                    <input
                      type="url"
                      required
                      value={cStreamUrl}
                      onChange={(e) => setCStreamUrl(e.target.value)}
                      placeholder="https://provider-stream.example.com/live/channel.m3u8"
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">Create Channel</button>
                    <button type="button" onClick={() => setShowNewChannel(false)} className="px-3.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs">Cancel</button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels.map((c) => (
                  <div key={c.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-sm text-white">{c.name}</h4>
                        <span className="text-[11px] text-slate-400">{c.categories.join(", ")} • {c.language.toUpperCase()}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${
                        c.status === "published" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {c.status}
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5 py-2 border-y border-slate-800 text-slate-400">
                      <div className="truncate">Stream: <span className="font-mono text-slate-300 text-[11px]">{c.streamUrl}</span></div>
                      {c.licenceExpiresAt && (
                        <div>Licence Expires: <span className="text-slate-300">{new Date(c.licenceExpiresAt).toLocaleDateString()}</span></div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <span>Playback Test:</span>
                        {c.playbackTestPassed ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" /> Passed & Verified
                          </span>
                        ) : (
                          <span className="text-amber-400 flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3 h-3" /> Pending Test Verification
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => runPlaybackTest(c.id)}
                        disabled={testingId === c.id}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-medium flex items-center gap-1.5"
                      >
                        {testingId === c.id ? <LoaderCircle className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                        Run Playback Test (No Billing)
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
