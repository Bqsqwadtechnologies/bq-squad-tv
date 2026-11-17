import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, ShieldCheck, Smartphone, Monitor } from "lucide-react";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/admin/ads")({
  component: AdminAdsPage,
  head: () => ({
    meta: [
      { title: "Ad provider settings | BQ SQWAD TV" },
      { name: "description", content: "Configure separate Android and website advertising providers." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function AdminAdsPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [platform, setPlatform] = useState<"android" | "web">("android");
  const [providerId, setProviderId] = useState("");
  const [publicAppId, setPublicAppId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [banner, setBanner] = useState("");
  const [interstitial, setInterstitial] = useState("");
  const [rewarded, setRewarded] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setToken(result.idToken);
      setEmail(result.email);
      setPassword("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Administrator sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const placements: Record<string, string> = {};
      if (banner.trim()) placements["banner"] = banner.trim();
      if (interstitial.trim()) placements["interstitial"] = interstitial.trim();
      if (rewarded.trim()) placements["rewarded"] = rewarded.trim();
      const response = await fetch("/api/public/v1/admin/ads/providers", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({ platform, providerId, publicAppId, placements, secretKey, enabled }),
      });
      const result = await response.json() as { saved?: boolean; error?: string };
      if (!response.ok || !result.saved) throw new Error(result.error ?? "Ad provider configuration could not be saved.");
      setSecretKey("");
      setMessage(platform === "android"
        ? "Android advertising settings saved separately from the website settings."
        : "Website advertising settings saved separately from the Android settings.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ad provider configuration could not be saved.");
      setSecretKey("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-5">
          <a href="/"><img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV" className="w-44" /></a>
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-200">Settings · Advertising</span>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><ShieldCheck size={16} /> Advertising configuration</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">Separate advertising services for each platform.</h1>
        <p className="mt-3 max-w-2xl leading-7 text-blue-100/60">Android and the website have separate account references and advertising placements. Private connection details are protected and never shown again.</p>

        {!token ? (
          <form onSubmit={login} className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
            <h2 className="text-xl font-bold">Administrator sign in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">Email
              <input type="email" required autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">Password
              <input type="password" required autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
            </label>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
            <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <div className="mt-9 grid gap-7 lg:grid-cols-[.7fr_1.3fr]">
            <aside className="rounded-3xl border border-white/10 bg-[#07143d] p-5">
              <h2 className="font-bold">Choose platform</h2>
              <button onClick={() => setPlatform("android")} className={platform === "android" ? "mt-4 flex w-full items-center gap-3 rounded-2xl border border-cyan-300/40 bg-cyan-300/10 p-4 text-left text-cyan-100" : "mt-4 flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-white/65"}><Smartphone /> Android app</button>
              <button onClick={() => setPlatform("web")} className={platform === "web" ? "mt-3 flex w-full items-center gap-3 rounded-2xl border border-cyan-300/40 bg-cyan-300/10 p-4 text-left text-cyan-100" : "mt-3 flex w-full items-center gap-3 rounded-2xl border border-white/10 p-4 text-left text-white/65"}><Monitor /> Website</button>
              <p className="mt-5 text-xs leading-5 text-blue-100/45">Each platform is saved separately. Changing one does not overwrite the other.</p>
            </aside>
            <form onSubmit={save} className="grid gap-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-[#0b2057] to-[#07143d] p-6">
              <div><h2 className="text-xl font-bold">{platform === "android" ? "Android app provider" : "Website provider"}</h2><p className="mt-1 text-xs text-blue-100/55">Connection details are protected and are never shown again.</p></div>
              <label className="grid gap-2 text-sm text-blue-100/70">Account reference
                <input required value={providerId} onChange={event => setProviderId(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">Public app or site reference
                <input value={publicAppId} onChange={event => setPublicAppId(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">Private connection key
                <input required type="password" autoComplete="new-password" value={secretKey} onChange={event => setSecretKey(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300" />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-2 text-xs text-blue-100/70">Banner placement<input value={banner} onChange={event => setBanner(event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Interstitial placement<input value={interstitial} onChange={event => setInterstitial(event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-white" /></label>
                <label className="grid gap-2 text-xs text-blue-100/70">Rewarded placement<input value={rewarded} onChange={event => setRewarded(event.target.value)} className="min-w-0 rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-white" /></label>
              </div>
              <label className="flex items-center gap-3 text-sm text-blue-100/70"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enable this provider configuration</label>
              {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
              {message ? <p role="status" className="text-sm text-cyan-200">{message}</p> : null}
              <button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60">{busy ? <LoaderCircle className="animate-spin" size={17} /> : null} Save {platform === "android" ? "Android" : "website"} provider</button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
