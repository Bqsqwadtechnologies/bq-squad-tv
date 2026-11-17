import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Tv2, ArrowLeft, LoaderCircle } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  isLive: boolean;
  currentProgramme: string | null;
  language: string | null;
};

export const Route = createFileRoute("/search")({
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search channels | BQ SQWAD TV" },
      { name: "description", content: "Find available channels on BQ SQWAD TV." },
    ],
  }),
});

function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreWebSession().then(token => {
      if (active) setSignedIn(Boolean(token));
    }).catch(() => {
      if (active) setSignedIn(false);
    });
    return () => { active = false; };
  }, []);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSearched(true);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setBusy(true);
    try {
      const token = await restoreWebSession();
      if (!token) {
        setSignedIn(false);
        throw new Error("Sign in to search the channel catalogue.");
      }
      const response = await fetch("/api/public/v1/catalog/search?q=" + encodeURIComponent(query.trim().slice(0, 100)), {
        headers: await getWebAuthHeaders(token),
        cache: "no-store",
      });
      const data = await response.json() as { results?: Channel[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Search is temporarily unavailable.");
      setResults(data.results ?? []);
      setSignedIn(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search is temporarily unavailable.");
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f9fe] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={17} /> Home</a>
          <a href="/account" className="text-sm font-semibold text-blue-700">Account</a>
        </header>
        <section className="mt-10 rounded-3xl border border-blue-100 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex items-center gap-3 text-blue-700"><span className="grid size-11 place-items-center rounded-xl bg-blue-50"><Search size={22} /></span><span className="text-xs font-bold uppercase tracking-[0.18em]">Discover</span></div>
          <h1 className="mt-5 text-3xl font-black sm:text-4xl">Search channels</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Find published channels by name. Results follow your account's content access settings.</p>
          <form onSubmit={search} className="mt-6 flex flex-col gap-3 sm:flex-row">
            <label className="sr-only" htmlFor="catalog-search">Channel name</label>
            <input id="catalog-search" value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Search channels…" className="min-w-0 flex-1 rounded-xl border border-blue-100 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500" />
            <button type="submit" disabled={busy || !query.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle size={17} className="animate-spin" /> : <Search size={17} />} Search</button>
          </form>
          {signedIn === false ? <p className="mt-4 text-sm text-slate-600">Sign in is required to search. <a href="/account" className="font-bold text-blue-700 underline">Sign in or create an account</a>.</p> : null}
          {error ? <p role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</p> : null}
          {searched && !busy && !error ? <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-slate-500">{results.length} {results.length === 1 ? "result" : "results"}</p> : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {results.map(channel => (
              <a key={channel.id} href={"/channels/" + encodeURIComponent(channel.id)} className="flex items-center gap-3 rounded-2xl border border-blue-100 p-3 transition hover:border-blue-300 hover:bg-blue-50/50">
                <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-50 text-blue-600">{channel.posterUrl ? <img src={channel.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Tv2 size={24} />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{channel.title}</span><span className="mt-1 block text-xs text-slate-500">{channel.category}{channel.language ? " · " + channel.language : ""}</span></span>
                {channel.isLive ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">LIVE</span> : null}
              </a>
            ))}
          </div>
          {searched && !busy && !error && results.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">No matching channels were found.</p> : null}
        </section>
        <footer className="py-8 text-center text-xs text-slate-500">BQ SQWAD TV · Bq Sqwad Technologies</footer>
      </div>
    </main>
  );
}
