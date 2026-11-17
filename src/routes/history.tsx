import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Clock3, LoaderCircle } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";
import { formatMinorCurrency } from "@/lib/format-money";

type LedgerItem = {
  id: string;
  description: string;
  amountMinor: number;
  createdAt: string;
  kind: string;
  currency: string;
};

export const Route = createFileRoute("/history")({
  component: WatchHistoryPage,
  head: () => ({ meta: [
    { title: "Watch history | BQ SQWAD TV" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
  ] }),
});

function WatchHistoryPage() {
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [busy, setBusy] = useState(true);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) { if (active) setSignedIn(false); return; }
        const response = await fetch("/api/public/v1/wallet/ledger?limit=100", {
          headers: await getWebAuthHeaders(token), cache: "no-store",
        });
        const data = await response.json() as { items?: LedgerItem[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Watch history is unavailable.");
        if (active) {
          setSignedIn(true);
          setItems((data.items ?? []).filter(item => item.kind === "watch_charge"));
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Watch history is unavailable.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <a href="/account" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-primary"><ArrowLeft size={17} /> Account</a>
        <section className="mt-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary"><Clock3 size={22} /></span><div><h1 className="text-2xl font-black">Watch history</h1><p className="text-sm text-muted-foreground">Your recent billed viewing sessions.</p></div></div>
          {busy ? <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="animate-spin" size={18} /> Loading watch history…</p> : null}
          {error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p> : null}
          {!busy && signedIn === false ? <p className="mt-6 rounded-xl bg-muted p-4 text-sm">Sign in to view your watch history. <a href="/account" className="font-bold text-primary underline">Sign in</a>.</p> : null}
          {!busy && signedIn && items.length === 0 ? <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Your completed viewing sessions will appear here.</p> : null}
          <div className="mt-6 grid gap-3">
            {items.map(item => (
              <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
                <div><p className="font-bold">{item.description}</p><p className="mt-1 text-xs text-muted-foreground">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Date unavailable"}</p></div>
                <p className="text-sm font-black tabular-nums">{formatMinorCurrency(item.amountMinor, item.currency)}</p>
              </article>
            ))}
          </div>
          <a href="/wallet#transactions" className="mt-6 inline-flex min-h-11 items-center font-bold text-primary underline">View wallet transactions</a>
        </section>
      </div>
    </main>
  );
}
