import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";
import { BadgeCheck, Film, LoaderCircle, LogOut, Radio, Users, Wallet } from "lucide-react";
import {
  getWebAuthHeaders,
  restoreWebSession,
  signInWithEmailPassword,
} from "@/lib/firebase-web-auth";

type Summary = {
  producerStatus: string;
  earningsBalanceMinor: number;
  earningsLifetimeMinor: number;
  currency: string;
  channelCount: number;
  publishedChannelCount: number;
  channels: Array<{ id: string; title: string; status: string }>;
};

type LegalPage = { slug: string; title: string; version: number; accepted: boolean; body: string };

type Earnings = {
  statement: Array<{
    id: string;
    kind: string;
    amountMinor: number;
    currency: string;
    createdAt: string | null;
  }>;
  payouts: Array<{
    id: string;
    amountMinor: number;
    currency: string;
    status: string;
    createdAt: string | null;
  }>;
};

function money(value: number, currency: string) {
  const digits =
    new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 10 ** digits);
}

export const Route = createFileRoute("/producer/")({
  component: ProducerPage,
  head: () => ({
    meta: [
      { title: "Workspace | BQ SQWAD TV" },
      { name: "description", content: "Manage channels, team access and earnings." },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ProducerPage() {
  return (
    <ConsolePageGuard role="producer">
      {({ token, account }) => (
        <ProducerConsole sessionToken={token} isOwner={Boolean(account?.isOwner)} />
      )}
    </ConsolePageGuard>
  );
}

function ProducerConsole({
  sessionToken,
  isOwner,
}: { sessionToken?: string; isOwner?: boolean } = {}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [legalPages, setLegalPages] = useState<LegalPage[]>([]);
  const [legalConsentChecked, setLegalConsentChecked] = useState(false);
  const [legalBusy, setLegalBusy] = useState(false);

  async function load(idToken: string) {
    const headers = await getWebAuthHeaders(idToken);
    const legalResponse = await fetch("/api/public/v1/legal/status?audience=producer", {
      headers,
      cache: "no-store",
    });
    const legalResult = (await legalResponse.json()) as {
      pages?: LegalPage[];
      acceptanceRequired?: boolean;
      error?: string;
    };
    if (!legalResponse.ok || !legalResult.pages)
      throw new Error(legalResult.error ?? "Producer terms could not be checked.");
    if (legalResult.acceptanceRequired) {
      setLegalPages(legalResult.pages);
      setLegalConsentChecked(false);
      return;
    }
    setLegalPages([]);
    const [summaryResponse, earningsResponse] = await Promise.all([
      fetch("/api/public/v1/producer/mobile-summary", { headers, cache: "no-store" }),
      fetch("/api/public/v1/producer/earnings", { headers, cache: "no-store" }),
    ]);
    const summaryResult = (await summaryResponse.json()) as Summary & { error?: string };
    const earningsResult = (await earningsResponse.json()) as Earnings & { error?: string };
    if (!summaryResponse.ok)
      throw new Error(summaryResult.error ?? "Producer access could not be verified.");
    if (!earningsResponse.ok)
      throw new Error(earningsResult.error ?? "Producer earnings could not be loaded.");
    setSummary(summaryResult);
    setEarnings(earningsResult);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const restored = sessionToken || (await restoreWebSession());
        if (restored && active) {
          setToken(restored);
          await load(restored);
        }
      } catch (caught) {
        if (active)
          setError(caught instanceof Error ? caught.message : "Could not load Producer Console.");
      }
    })();
    return () => {
      active = false;
    };
  }, [sessionToken]);

  async function acceptProducerTerms() {
    if (!legalConsentChecked || !token || !legalPages.length || legalBusy) return;
    setLegalBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/v1/legal/acceptance", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "content-type": "application/json" },
        body: JSON.stringify({
          audience: "producer",
          acceptedSlugs: legalPages.map((page) => page.slug),
        }),
      });
      const result = (await response.json()) as { accepted?: boolean; error?: string };
      if (!response.ok || !result.accepted)
        throw new Error(result.error ?? "Producer terms could not be accepted.");
      await load(token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Producer terms could not be accepted.");
    } finally {
      setLegalBusy(false);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setEmail(result.email);
      setPassword("");
      setToken(result.idToken);
      await load(result.idToken);
    } catch (caught) {
      setPassword("");
      setError(caught instanceof Error ? caught.message : "Producer sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    setToken("");
    setSummary(null);
    setEarnings(null);
    setPassword("");
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-5">
          <a href="/">
            <BrandLogo variant="horizontal" className="h-8 w-auto" />
          </a>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-cyan-200">
              Producer Console
            </span>
            {token ? (
              <button
                onClick={signOut}
                className="rounded-lg border border-white/10 p-2 text-blue-100/70"
                aria-label="Sign out"
              >
                <LogOut size={17} />
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        {isOwner && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-400/30 bg-gradient-to-r from-cyan-900/40 via-[#07143d] to-[#030b2a] p-4 text-xs shadow-lg">
            <div className="flex items-center gap-2.5">
              <span className="rounded-full bg-cyan-400/20 px-2.5 py-0.5 font-bold uppercase tracking-wider text-cyan-300">
                Platform Owner Access
              </span>
              <span className="text-white font-medium">
                You are signed in with verified owner access.
              </span>
            </div>
            <a
              href="/admin"
              className="rounded-xl border border-cyan-300/40 bg-cyan-400/10 px-4 py-2 font-bold text-cyan-200 hover:bg-cyan-400/20 transition"
            >
              Open Management Console →
            </a>
          </div>
        )}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
          Creator operations
        </p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">Your production workspace</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">
          Manage your channels, authorized team members, programming schedules and revenue
          statements. Your channel permissions and producer verification are checked by the server.
        </p>

        {error && !summary ? (
          <div
            role="alert"
            className="mt-8 max-w-md rounded-3xl border border-rose-300/20 bg-rose-300/5 p-6 text-sm text-rose-200"
          >
            {error}
          </div>
        ) : null}

        {token && legalPages.length ? (
          <section className="mt-8 rounded-3xl border border-cyan-300/20 bg-[#07143d] p-5 sm:p-7">
            <h2 className="text-2xl font-black">Review producer terms</h2>
            <p className="mt-2 text-sm leading-6 text-blue-100/65">
              Review the current Terms, Privacy Policy, Producer Terms and Producer Content Policy
              before opening your workspace.
            </p>
            <div className="mt-5 grid gap-3">
              {legalPages.map((page) => (
                <details
                  key={page.slug}
                  className="rounded-xl border border-white/10 bg-[#030b2a] p-4"
                >
                  <summary className="cursor-pointer font-bold">
                    {page.title} · version {page.version}
                  </summary>
                  <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-6 text-blue-100/70">
                    {page.body}
                  </pre>
                </details>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-3 text-sm text-blue-100/75">
              <input
                type="checkbox"
                checked={legalConsentChecked}
                onChange={(event) => setLegalConsentChecked(event.target.checked)}
                className="mt-1 size-4 accent-cyan-300"
              />
              <span>I have reviewed and accept all current producer documents.</span>
            </label>
            <button
              type="button"
              onClick={() => void acceptProducerTerms()}
              disabled={!legalConsentChecked || legalBusy}
              className="mt-5 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-extrabold text-[#031039] disabled:opacity-50"
            >
              {legalBusy ? "Saving acceptance…" : "Accept and open Producer Console"}
            </button>
          </section>
        ) : null}
        {token && !summary && !error && !legalPages.length ? (
          <div className="mt-8 flex items-center gap-3 text-sm text-blue-100/60">
            <LoaderCircle className="animate-spin" /> Loading your workspace…
          </div>
        ) : null}
        {token && error ? (
          <div
            role="alert"
            className="mt-8 rounded-2xl border border-rose-300/20 bg-rose-300/5 p-4 text-sm text-rose-200"
          >
            {error}
          </div>
        ) : null}

        {summary ? (
          <>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-cyan-300/20 bg-[#07143d] p-5">
                <Wallet className="text-cyan-200" />
                <p className="mt-4 text-xs text-blue-100/50">Available earnings</p>
                <p className="mt-1 text-2xl font-black">
                  {money(summary.earningsBalanceMinor, summary.currency)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <BadgeCheck className="text-cyan-200" />
                <p className="mt-4 text-xs text-blue-100/50">Lifetime earnings</p>
                <p className="mt-1 text-2xl font-black">
                  {money(summary.earningsLifetimeMinor, summary.currency)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <Film className="text-cyan-200" />
                <p className="mt-4 text-xs text-blue-100/50">Channels</p>
                <p className="mt-1 text-2xl font-black">{summary.channelCount}</p>
                <p className="mt-1 text-xs text-blue-100/45">
                  {summary.publishedChannelCount} published
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5">
                <Radio className="text-cyan-200" />
                <p className="mt-4 text-xs text-blue-100/50">Producer status</p>
                <p className="mt-1 text-lg font-black">{summary.producerStatus}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
              <section className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-black">Your channels</h2>
                  <a href="/producer/channels" className="text-xs font-bold text-cyan-200">
                    Manage channels →
                  </a>
                </div>
                {summary.channels.length ? (
                  <div className="mt-5 grid gap-3">
                    {summary.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-bold">{channel.title}</p>
                          <p className="mt-1 text-xs text-blue-100/45">{channel.id}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-cyan-300/20 px-3 py-1 text-[10px] font-bold text-cyan-200">
                          {channel.status}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-5 text-sm text-blue-100/55">
                    No channels are linked to this producer account yet.
                  </p>
                )}
              </section>
              <section className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
                <h2 className="text-xl font-black">Workspace tools</h2>
                <div className="mt-5 grid gap-3">
                  <a
                    href="/producer/channels"
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"
                  >
                    <Film className="text-cyan-200" />
                    <span className="font-bold">Channels & content</span>
                  </a>
                  <a
                    href="/producer/channels"
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"
                  >
                    <Radio className="text-cyan-200" />
                    <span className="font-bold">Programming schedules</span>
                  </a>
                  <a
                    href="/producer/channels"
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"
                  >
                    <Users className="text-cyan-200" />
                    <span className="font-bold">Channel teams</span>
                  </a>
                  <a
                    href="#earnings"
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#030b2a] p-4"
                  >
                    <Wallet className="text-cyan-200" />
                    <span className="font-bold">Earnings & payout history</span>
                  </a>
                </div>
              </section>
            </div>
            <section id="earnings" className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
                <h2 className="text-xl font-black">Recent earnings statement</h2>
                {earnings?.statement.length ? (
                  <div className="mt-4 grid gap-3">
                    {earnings.statement.slice(0, 10).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-3 border-b border-white/5 pb-3"
                      >
                        <div>
                          <p className="text-sm font-bold">{row.kind.replaceAll("_", " ")}</p>
                          <p className="mt-1 text-xs text-blue-100/45">
                            {row.createdAt ?? "Date unavailable"}
                          </p>
                        </div>
                        <p className="text-sm font-bold">{money(row.amountMinor, row.currency)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-blue-100/50">
                    No earning entries are available in the recent statement window.
                  </p>
                )}
              </div>
              <div className="rounded-3xl border border-white/10 bg-[#07143d] p-5 sm:p-7">
                <h2 className="text-xl font-black">Payout history</h2>
                {earnings?.payouts.length ? (
                  <div className="mt-4 grid gap-3">
                    {earnings.payouts.slice(0, 10).map((row) => (
                      <div
                        key={row.id}
                        className="flex items-center justify-between gap-3 border-b border-white/5 pb-3"
                      >
                        <div>
                          <p className="text-sm font-bold">{row.status}</p>
                          <p className="mt-1 text-xs text-blue-100/45">
                            {row.createdAt ?? "Date unavailable"}
                          </p>
                        </div>
                        <p className="text-sm font-bold">{money(row.amountMinor, row.currency)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-blue-100/50">No payout requests yet.</p>
                )}
              </div>
            </section>
            <p className="mt-6 text-xs leading-6 text-blue-100/40">
              Live channel scheduling is available through channel schedules. Actual live ingest and
              delivery still require an authorized streaming-provider adapter; no provider is
              silently enabled by this console.
            </p>
          </>
        ) : null}
      </section>
    </main>
  );
}
