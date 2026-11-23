import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, ArrowLeft, LoaderCircle, Mic, Tv2, Film, Clapperboard, Smile, Users, BadgeCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type SearchItem = {
  id: string;
  title: string;
  category: string;
  posterUrl: string | null;
  isLive?: boolean;
  currentProgramme?: string | null;
  pricePerMinute?: string;
};

const categories = ["All", "Live TV", "Movies", "Series", "Kids"];
const suggestionPills = ["Premier League", "Nollywood", "Hollywood Action", "Cartoons", "News"];

export const Route = createFileRoute("/search")({
  component: SearchPage,
  head: () => ({
    meta: [
      { title: "Search Catalogue | BQ SQWAD TV" },
      { name: "description", content: "Search channels, movies, and series on BQ SQWAD TV." },
    ],
  }),
});

function SearchPage() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [currencySymbol, setCurrencySymbol] = useState("₦");
  const [producers, setProducers] = useState<Array<{
    slug: string;
    name: string;
    avatarUrl: string | null;
    verified: boolean;
    followerCount: number;
  }>>([]);

  useEffect(() => {
    fetch("/api/public/v1/config/client", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : {}))
      .then((cfg: { currencySymbol?: string }) => {
        if (cfg.currencySymbol) setCurrencySymbol(cfg.currencySymbol);
      })
      .catch(() => {});
  }, []);

  async function executeSearch(searchQuery: string) {
    if (!searchQuery.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setBusy(true);
    setSearched(true);
    try {
      const token = await restoreWebSession();
      const headers = token ? await getWebAuthHeaders(token) : {};
      const response = await fetch(
        "/api/public/v1/catalog/search?q=" + encodeURIComponent(searchQuery.trim().slice(0, 100)),
        { headers, cache: "no-store" },
      );
      if (response.ok) {
        const data = (await response.json()) as {
          results?: SearchItem[];
          channels?: SearchItem[];
          producers?: Array<{
            slug: string;
            name: string;
            avatarUrl: string | null;
            verified: boolean;
            followerCount: number;
          }>;
        };
        const items = data.results || data.channels || [];
        setResults(Array.isArray(items) ? items : []);
        setProducers(Array.isArray(data.producers) ? data.producers : []);
      } else {
        setResults([]);
        setProducers([]);
      }
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  function handleVoiceSearch() {
    if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
      // @ts-expect-error speech recognition browser global
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.onresult = (event: { results: Array<Array<{ transcript: string }>> }) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setQuery(transcript);
          executeSearch(transcript);
        }
      };
      recognition.start();
    }
  }

  const filteredResults = results.filter((item) => {
    if (selectedCategory === "All") return true;
    return item.category.toLowerCase().includes(selectedCategory.toLowerCase());
  });

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#030B2A] via-[#07143D] to-[#0A1A4A] px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between pb-6 border-b border-white/10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#00D8F5] hover:underline"
          >
            <ArrowLeft size={18} /> Home
          </Link>
          <BrandLogo variant="horizontal" className="h-7 w-auto" />
        </div>

        {/* Search Bar */}
        <div className="mt-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              executeSearch(query);
            }}
            className="relative flex items-center"
          >
            <Search className="absolute left-4 h-5 w-5 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value.length > 2) executeSearch(e.target.value);
              }}
              placeholder="Search channels, movies, series..."
              className="w-full rounded-2xl border border-white/15 bg-[#0C1738]/90 py-3.5 pl-12 pr-12 text-sm text-white placeholder-slate-400 backdrop-blur-md focus:border-[#00D8F5] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleVoiceSearch}
              className="absolute right-4 text-slate-400 hover:text-[#00D8F5]"
              title="Voice search"
            >
              <Mic size={18} />
            </button>
          </form>

          {/* Category Filter Pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                  selectedCategory === cat
                    ? "bg-[#00D8F5] text-[#030B2A] shadow-md shadow-[#00D8F5]/20"
                    : "border border-white/10 bg-[#0C1738] text-slate-300 hover:border-white/20"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results Area */}
        <section className="mt-8 space-y-8">
          {/* Rule N10: Matching Producers */}
          {producers.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                <Users className="h-4 w-4 text-[#00D8F5]" />
                Producers ({producers.length})
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {producers.map((p) => (
                  <Link
                    key={p.slug}
                    to="/p/$slug"
                    params={{ slug: p.slug }}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-white/10 bg-[#0C1738] hover:border-[#00D8F5]/50 transition group"
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-primary/20 shrink-0 flex items-center justify-center font-bold text-sm text-[#00D8F5]">
                      {p.avatarUrl ? (
                        <img src={p.avatarUrl} alt={p.name} className="w-full h-full object-cover" />
                      ) : (
                        p.name.charAt(0)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-white truncate group-hover:text-[#00D8F5]">
                          {p.name}
                        </span>
                        {p.verified && (
                          <BadgeCheck className="w-3.5 h-3.5 fill-cyan-400 text-[#0C1738] shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">
                        {p.followerCount} followers • View Profile
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {busy ? (
            <div className="flex items-center justify-center py-16">
              <LoaderCircle className="h-8 w-8 animate-spin text-[#00D8F5]" />
            </div>
          ) : searched && filteredResults.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-[#0C1738]/60 p-8 text-center backdrop-blur-md">
              <p className="text-base font-bold text-white">No matches found</p>
              <p className="mt-2 text-xs text-slate-400">
                Try searching for something else, or tap one of these popular suggestions:
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {suggestionPills.map((pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => {
                      setQuery(pill);
                      executeSearch(pill);
                    }}
                    className="rounded-xl border border-cyan-400/30 bg-[#00D8F5]/10 px-3 py-1 text-xs font-semibold text-[#00D8F5] hover:bg-[#00D8F5]/20"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {filteredResults.map((item) => (
                <Link
                  key={item.id}
                  to="/channels/$channelId"
                  params={{ channelId: item.id }}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-[#0C1738] transition hover:border-[#00D8F5]/50 hover:shadow-lg"
                >
                  <div className="aspect-[2/3] w-full bg-gradient-to-t from-[#030B2A] to-[#142456] flex items-end p-3">
                    <div className="w-full">
                      <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-[#00D8F5]">
                        {currencySymbol}
                        {item.pricePerMinute ?? "0.25"}/min
                      </span>
                      <h3 className="mt-1 line-clamp-1 text-xs font-bold text-white group-hover:text-[#00D8F5]">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-slate-400">{item.category}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
