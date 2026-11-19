import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  KeyRound,
  LoaderCircle,
  LogOut,
  Plus,
  RadioTower,
  ShieldCheck,
  Users,
} from "lucide-react";
import { getWebAuthHeaders, signInWithEmailPassword } from "@/lib/firebase-web-auth";

type Channel = {
  id: string;
  title: string;
  category: string;
  published: boolean;
  status: string;
  deliveryMode: string;
  providerSetupStatus?: string | null;
};

export const Route = createFileRoute("/producer/channels")({
  component: ProducerChannelsPage,
  head: () => ({
    meta: [
      { title: "Producer channels | BQ SQWAD TV" },
      { name: "description", content: "Create and manage BQ SQWAD TV channels." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProducerChannelsPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Entertainment");
  const [description, setDescription] = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"bq_hosted" | "external">("bq_hosted");
  const [providerId, setProviderId] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadChannels(idToken: string) {
    const response = await fetch("/api/public/v1/producer/channels", {
      headers: await getWebAuthHeaders(idToken),
    });
    const result = (await response.json()) as Channel[] | { error?: string };
    if (!response.ok || !Array.isArray(result)) {
      throw new Error(
        !Array.isArray(result)
          ? (result.error ?? "Producer access is unavailable.")
          : "Could not load channels.",
      );
    }
    setChannels(result);
  }

  useEffect(() => {
    if (!token) return;
    loadChannels(token).catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Could not load channels."),
    );
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
      setMessage("Signed in. Checking producer access…");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function createChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/public/v1/producer/channels", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          title,
          category,
          description,
          deliveryMode,
          ...(deliveryMode === "external" ? { providerId, providerKey } : {}),
        }),
      });
      const result = (await response.json()) as {
        channelId?: string;
        providerSetupStatus?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "The channel could not be created.");
      setTitle("");
      setDescription("");
      setProviderKey("");
      setMessage(
        deliveryMode === "external"
          ? "Channel created. Provider credentials were encrypted; the provider adapter still needs to be connected and verified."
          : "Channel created as a draft. Add content and submit rights for review.",
      );
      await loadChannels(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The channel could not be created.");
      setProviderKey("");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken("");
    setChannels([]);
    setPassword("");
    setProviderKey("");
    setMessage("");
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/" className="flex items-center gap-3">
            <img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-44" />
            <span className="hidden border-l border-white/15 pl-3 text-xs text-blue-100/60 sm:block">
              Producer studio
            </span>
          </a>
          {token ? (
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 text-sm text-blue-100/70 hover:text-white"
            >
              <LogOut size={16} /> Sign out
            </button>
          ) : null}
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
            <RadioTower size={16} /> Producer workspace
          </p>
          <h1 className="mt-4 text-3xl font-black sm:text-4xl">Your channels, in one place.</h1>
          <p className="mt-3 leading-7 text-blue-100/60">
            Create a channel, choose its delivery method, and submit content rights for review
            before publication.
          </p>
        </div>

        {!token ? (
          <form
            onSubmit={signIn}
            className="mt-9 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6"
          >
            <h2 className="text-xl font-bold">Producer sign in</h2>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
              />
            </label>
            <label className="grid gap-2 text-sm text-blue-100/70">
              Password
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
              />
            </label>
            {error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}
            <button
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60"
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <ShieldCheck size={17} />
              )}{" "}
              Sign in
            </button>
          </form>
        ) : (
          <div className="mt-9 grid gap-7 lg:grid-cols-[1.1fr_.9fr]">
            <section className="rounded-3xl border border-white/10 bg-[#07143d] p-6">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">My channels</h2>
                  <p className="mt-1 text-xs text-blue-100/50">{channels.length} channels</p>
                </div>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
                  Producer
                </span>
              </div>
              {channels.length ? (
                <div className="divide-y divide-white/10">
                  {channels.map((channel) => (
                    <article
                      key={channel.id}
                      className="flex items-center justify-between gap-4 py-4"
                    >
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold">{channel.title}</h3>
                        <p className="mt-1 text-xs text-blue-100/50">
                          {channel.category} ·{" "}
                          {channel.deliveryMode === "external" ? "External provider" : "BQ hosted"}
                        </p>
                        <p className="mt-1 text-[11px] text-cyan-200/70">
                          {channel.providerSetupStatus ?? channel.status}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span
                          className={
                            channel.published
                              ? "rounded-full bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200"
                              : "rounded-full bg-white/10 px-3 py-1 text-xs text-white/60"
                          }
                        >
                          {channel.published ? "Published" : "Draft"}
                        </span>
                        <a
                          href={"/producer/channels/" + encodeURIComponent(channel.id) + "/team"}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/20 px-2.5 py-1.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-300/10"
                        >
                          <Users size={13} /> Manage team
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/15 p-7 text-center text-sm text-blue-100/50">
                  No channels yet. Create your first channel.
                </div>
              )}
            </section>

            <form
              onSubmit={createChannel}
              className="grid gap-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-b from-[#0b2057] to-[#07143d] p-6"
            >
              <div>
                <h2 className="text-xl font-bold">Create a channel</h2>
                <p className="mt-1 text-xs text-blue-100/55">
                  New channels start unpublished and require rights review.
                </p>
              </div>
              <label className="grid gap-2 text-sm text-blue-100/70">
                Channel name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                />
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">
                Category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                >
                  {[
                    "Entertainment",
                    "Sports",
                    "News",
                    "Movies",
                    "Series",
                    "Kids",
                    "Music",
                    "Education",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">
                Description
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="resize-y rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                />
              </label>
              <label className="grid gap-2 text-sm text-blue-100/70">
                Delivery method
                <select
                  value={deliveryMode}
                  onChange={(event) =>
                    setDeliveryMode(event.target.value as "bq_hosted" | "external")
                  }
                  className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                >
                  <option value="bq_hosted">BQ hosted media</option>
                  <option value="external">Licensed external provider</option>
                </select>
              </label>
              {deliveryMode === "external" ? (
                <div className="grid gap-3 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4">
                  <p className="flex items-center gap-2 text-xs font-bold text-cyan-200">
                    <KeyRound size={15} /> Provider credentials
                  </p>
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Provider ID
                    <input
                      required
                      value={providerId}
                      onChange={(event) =>
                        setProviderId(event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                      }
                      placeholder="your_provider"
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                    />
                  </label>
                  <label className="grid gap-2 text-sm text-blue-100/70">
                    Provider access key
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      value={providerKey}
                      onChange={(event) => setProviderKey(event.target.value)}
                      placeholder="Enter provider key"
                      className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white outline-none focus:border-cyan-300"
                    />
                  </label>
                  <p className="text-[11px] leading-5 text-blue-100/50">
                    The key is sent over HTTPS and encrypted before storage. It is never returned to
                    the browser. Playback stays disabled until the provider adapter is connected and
                    verified.
                  </p>
                </div>
              ) : null}
              {error ? (
                <p role="alert" className="text-sm text-rose-300">
                  {error}
                </p>
              ) : null}
              {message ? (
                <p role="status" className="text-sm text-cyan-200">
                  {message}
                </p>
              ) : null}
              <button
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-300 to-blue-400 px-5 py-3 font-extrabold text-[#031039] disabled:opacity-60"
              >
                {busy ? <LoaderCircle className="animate-spin" size={17} /> : <Plus size={17} />}{" "}
                Create channel
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
