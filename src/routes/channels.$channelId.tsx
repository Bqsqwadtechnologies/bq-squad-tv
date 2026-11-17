import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, CalendarDays, Tv2 } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession } from "@/lib/firebase-web-auth";

type Channel = { id: string; title: string; category: string; posterUrl: string | null; isLive: boolean; currentProgramme: string | null; language: string | null };
type Programme = { id: string; title: string; startsAt: string; endsAt: string; description: string | null };
type ChannelDetails = { channel: Channel; schedule: Programme[]; replays: Channel[] };

export const Route = createFileRoute("/channels/$channelId")({
  component: ChannelPage,
  head: () => ({ meta: [{ title: "Channel | BQ SQWAD TV" }, { name: "description", content: "Channel details and programme schedule." }] }),
});

function ChannelPage() {
  const { channelId } = Route.useParams();
  const [details, setDetails] = useState<ChannelDetails | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await restoreWebSession();
        if (!token) throw new Error("Sign in to view channel details.");
        const response = await fetch("/api/public/v1/channels/" + encodeURIComponent(channelId), {
          headers: await getWebAuthHeaders(token),
          cache: "no-store",
        });
        const data = await response.json() as ChannelDetails & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "This channel is not available.");
        if (active) setDetails(data);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load this channel.");
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => { active = false; };
  }, [channelId]);

  return (
    <main className="min-h-screen bg-[#f7f9fe] px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <a href="/search" className="inline-flex items-center gap-2 text-sm font-bold text-blue-700"><ArrowLeft size={17} /> Back to search</a>
        {busy ? <p className="mt-10 text-sm text-slate-500">Loading channel…</p> : null}
        {error ? <section className="mt-8 rounded-2xl border border-amber-200 bg-white p-6"><p role="alert" className="text-sm text-amber-900">{error}</p><a href="/account" className="mt-4 inline-block text-sm font-bold text-blue-700 underline">Open account</a></section> : null}
        {details ? (
          <>
            <section className="mt-8 overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-sm">
              <div className="relative flex min-h-56 items-end bg-gradient-to-br from-blue-800 to-cyan-600 p-6 text-white sm:min-h-72 sm:p-9">
                {details.channel.posterUrl ? <img src={details.channel.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-35" /> : <Tv2 size={76} className="absolute right-8 top-8 opacity-25" />}
                <div className="relative"><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-100">{details.channel.category}</p><h1 className="mt-2 text-3xl font-black sm:text-4xl">{details.channel.title}</h1><p className="mt-2 text-sm text-blue-50">{details.channel.currentProgramme ?? "Programme information unavailable"}{details.channel.language ? " · " + details.channel.language : ""}</p>{details.channel.isLive ? <span className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">LIVE NOW</span> : null}</div>
              </div>
              <div className="p-6 sm:p-8">
                <div className="flex items-center gap-2"><CalendarDays size={18} className="text-blue-700" /><h2 className="text-lg font-black">Programme schedule</h2></div>
                {details.schedule.length ? <div className="mt-4 divide-y divide-blue-100">{details.schedule.map(item => <article key={item.id} className="py-4"><p className="text-sm font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.startsAt ? new Date(item.startsAt).toLocaleString() : "Time to be announced"}{item.endsAt ? " – " + new Date(item.endsAt).toLocaleTimeString() : ""}</p>{item.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p> : null}</article>)}</div> : <p className="mt-4 text-sm text-slate-500">No programme times have been published yet.</p>}
              </div>
            </section>
            {details.replays.length ? <section className="mt-8"><h2 className="text-xl font-black">Available replays</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{details.replays.map(item => <article key={item.id} className="rounded-2xl border border-blue-100 bg-white p-4"><p className="font-bold">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.category}</p></article>)}</div></section> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
