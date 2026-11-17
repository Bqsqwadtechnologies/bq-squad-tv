import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Film, LoaderCircle, Search, Star } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type FeaturedContent = {
  id: string;
  channelId: string;
  channelTitle: string;
  title: string;
  category: string;
  posterUrl: string | null;
  averageStars: number;
  ratingCount: number;
};

export const Route = createFileRoute("/series")({
  component: SeriesPage,
  head: () => ({ meta: [
    { title: "Series | BQ SQWAD TV" },
    { name: "description", content: "Browse published series on BQ SQWAD TV." },
  ] }),
});

function SeriesPage() {
  const [items, setItems] = useState<FeaturedContent[]>([]);
  const [selected, setSelected] = useState("All");
  const [busy, setBusy] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) {
          if (active) { setSignedIn(false); setItems([]); }
          return;
        }
        const response = await fetch("/api/public/v1/catalog/home", {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        const data = await response.json() as { featuredContent?: FeaturedContent[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "The catalogue is temporarily unavailable.");
        if (active) {
          const all = Array.isArray(data.featuredContent) ? data.featuredContent : [];
          setItems(all.filter(item => item.category.toLowerCase().includes("series")));
          setSignedIn(true);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The catalogue is temporarily unavailable.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const visibleItems = useMemo(() => selected === "All"
    ? items
    : items.filter(item => item.category.toLowerCase().includes(selected.toLowerCase())),
    [items, selected]);

  return (
    <main className="min-h-screen bg-[#f7f9fe] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <a href="/" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={17} /> Home</a>
          <a href="/account" className="text-sm font-semibold text-blue-700">Profile</a>
        </header>
        <section className="mt-8 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3 text-blue-700">
            <span className="grid size-11 place-items-center rounded-xl bg-blue-50"><Film size={22} /></span>
            <span className="text-xs font-bold uppercase tracking-[0.18em]">BQ SQWAD TV library</span>
          </div>
          <h1 className="mt-5 text-3xl font-black sm:text-4xl">Series</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Browse published series that are available to your account and region.</p>
          <div className="mt-6 flex gap-2 overflow-x-auto pb-2" aria-label="Series categories">
            {["All","Drama","Thriller","Comedy"].map(category => (
              <button key={category} type="button" onClick={() => setSelected(category)} aria-pressed={selected === category}
                className={selected === category
                  ? "min-h-10 shrink-0 rounded-full bg-blue-700 px-4 text-xs font-bold text-white"
                  : "min-h-10 shrink-0 rounded-full border border-blue-100 bg-white px-4 text-xs font-bold text-slate-600 hover:border-blue-300"}>
                {category}
              </button>
            ))}
          </div>
          {busy ? <p className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Loading titles…</p> : null}
          {error ? <p role="alert" className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</p> : null}
          {signedIn === false ? <p className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-slate-700">Sign in to browse published titles. <a href="/account" className="font-bold text-blue-700 underline">Sign in or create an account</a>.</p> : null}
          {!busy && !error && signedIn && visibleItems.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-blue-200 bg-slate-50 p-8 text-center text-sm text-slate-500">No published series are available in this category yet.</p> : null}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
            {visibleItems.map(item => (
              <a key={item.id} href={"/channels/" + encodeURIComponent(item.channelId)} className="group overflow-hidden rounded-2xl border border-blue-100 bg-white transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg">
                <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-br from-blue-100 to-cyan-100">
                  {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]" /> : <div className="grid h-full place-items-center text-blue-400"><Film size={42} /></div>}
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-extrabold text-slate-900">{item.title}</p>
                  <p className="mt-1 truncate text-[11px] text-slate-500">{item.channelTitle} · {item.category}</p>
                  {item.ratingCount > 0 ? <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-amber-600"><Star size={12} fill="currentColor" /> {item.averageStars.toFixed(1)} ({item.ratingCount})</p> : null}
                </div>
              </a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
