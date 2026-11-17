import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileBarChart, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { getWebAuthHeaders, restoreWebSession, signInWithEmailPassword } from "@/lib/firebase-web-auth";

type Report = {
  month: string;
  ledger: { entries: number; totalsByCurrency: Record<string, { amountMinor: number; entries: number }>; byKind: Record<string, { entries: number; amountByCurrency: Record<string, number> }> };
  payouts: { requests: number; byStatus: Record<string, number>; totalsByCurrency: Record<string, { amountMinor: number; entries: number }> };
  advertising: { events: number; byEvent: Record<string, number> };
  producerReviews: { decisions: number };
  truncated: Record<string, boolean>;
  note: string;
};

function formatMoney(amountMinor: number, currency: string) {
  if (!Number.isSafeInteger(amountMinor)) return "—";
  const locale = undefined;
  const digits = new Intl.NumberFormat(locale, { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  const absolute = BigInt(Math.abs(amountMinor));
  const scale = 10n ** BigInt(digits);
  const whole = absolute / scale;
  const fraction = absolute % scale;
  const signedWhole = amountMinor < 0 && whole === 0n ? -1n : amountMinor < 0 ? -whole : whole;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
  const parts = formatter.formatToParts(signedWhole);
  if (amountMinor < 0 && whole === 0n) {
    const zero = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 0 }).format(0);
    const integer = parts.findIndex(part => part.type === "integer");
    if (integer >= 0) parts[integer] = { type: "integer", value: zero };
  }
  if (digits === 0) return parts.map(part => part.value).join("");
  const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    .formatToParts(1.1).find(part => part.type === "decimal")?.value ?? ".";
  const fractionText = new Intl.NumberFormat(locale, {
    useGrouping: false, minimumIntegerDigits: digits, maximumFractionDigits: 0,
  }).format(fraction);
  let lastNumeric = -1;
  parts.forEach((part, index) => {
    if (part.type === "integer" || part.type === "group") lastNumeric = index;
  });
  parts.splice(lastNumeric + 1, 0, { type: "decimal", value: decimal }, { type: "fraction", value: fractionText });
  return parts.map(part => part.value).join("");
}

export const Route = createFileRoute("/admin/reports")({
  component: MonthlyReportsPage,
  head: () => ({ meta: [{ title: "Monthly reports | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});

function MonthlyReportsPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load(idToken: string, selectedMonth: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public/v1/admin/reports/monthly?month=" + encodeURIComponent(selectedMonth), {
        headers: await getWebAuthHeaders(idToken),
        cache: "no-store",
      });
      const result = await response.json() as Report & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The monthly report could not be loaded.");
      setReport(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The monthly report could not be loaded.");
      setReport(null);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const restored = await restoreWebSession();
        if (restored && active) {
          setToken(restored);
          await load(restored, month);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Could not restore the owner session.");
      }
    })();
    return () => { active = false; };
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await signInWithEmailPassword(email, password);
      setToken(result.idToken);
      setEmail(result.email);
      setPassword("");
      await load(result.idToken, month);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#030b2a] text-white">
      <header className="border-b border-cyan-300/15 bg-[#050f35]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
          <a href="/admin/" className="flex items-center gap-3"><img src="/brand/bq-sqwad-tv-logo.png" alt="BQ SQWAD TV" className="w-40" /></a>
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-200"><ShieldCheck size={15}/> Zillionaire Dashboard · Reports</span>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-5 py-10">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300"><FileBarChart size={16}/> Monthly operations</p>
        <h1 className="mt-3 text-3xl font-black sm:text-4xl">Platform activity report</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-blue-100/60">A read-only summary of wallet transactions, payout requests, advertising activity and producer reviews.</p>
        {!token ? <form onSubmit={login} className="mt-8 grid max-w-md gap-4 rounded-3xl border border-white/10 bg-[#07143d] p-6">
          <h2 className="text-lg font-bold">Zillionaire Dashboard sign-in</h2>
          <label className="grid gap-2 text-sm text-blue-100/70">Email<input type="email" required autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"/></label>
          <label className="grid gap-2 text-sm text-blue-100/70">Password<input type="password" required autoComplete="current-password" value={password} onChange={event=>setPassword(event.target.value)} className="rounded-xl border border-white/10 bg-[#030b2a] px-4 py-3 text-white"/></label>
          {error ? <p role="alert" className="text-sm text-rose-200">{error}</p> : null}
          <button disabled={busy} className="rounded-xl bg-cyan-300 px-5 py-3 font-extrabold text-[#031039]">{busy ? "Signing in…" : "Open reports"}</button>
        </form> : <div className="mt-8">
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-[#07143d] p-4">
            <label className="grid gap-2 text-xs text-blue-100/60">Report month<input type="month" value={month} onChange={event=>setMonth(event.target.value)} className="rounded-lg border border-white/10 bg-[#030b2a] px-3 py-2 text-white"/></label>
            <button disabled={busy || !month} onClick={()=>void load(token,month)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-bold text-[#031039] disabled:opacity-50"><RefreshCw size={15}/>{busy ? "Loading…" : "Refresh report"}</button>
          </div>
          {error ? <p role="alert" className="mt-4 rounded-xl border border-rose-300/20 p-4 text-sm text-rose-200">{error}</p> : null}
          {busy && !report ? <p className="mt-6 flex items-center gap-2 text-sm text-blue-100/60"><LoaderCircle className="animate-spin"/>Loading report…</p> : null}
          {report ? <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><p className="text-xs text-blue-100/50">Ledger entries</p><p className="mt-2 text-3xl font-black">{report.ledger.entries}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><p className="text-xs text-blue-100/50">Payout requests</p><p className="mt-2 text-3xl font-black">{report.payouts.requests}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><p className="text-xs text-blue-100/50">Ad events</p><p className="mt-2 text-3xl font-black">{report.advertising.events}</p></div>
              <div className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><p className="text-xs text-blue-100/50">Producer reviews</p><p className="mt-2 text-3xl font-black">{report.producerReviews.decisions}</p></div>
            </div>
            <div className="mt-6 grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><h2 className="font-bold">Ledger by currency</h2>{Object.entries(report.ledger.totalsByCurrency).map(([currency,value])=><div key={currency} className="mt-3 flex justify-between gap-3 border-b border-white/5 pb-3 text-sm"><span>{currency} · {value.entries} entries</span><strong>{formatMoney(value.amountMinor,currency)}</strong></div>)}</section>
              <section className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><h2 className="font-bold">Payout requests by status</h2>{Object.entries(report.payouts.byStatus).map(([status,count])=><div key={status} className="mt-3 flex justify-between gap-3 border-b border-white/5 pb-3 text-sm"><span>{status}</span><strong>{count}</strong></div>)}</section>
              <section className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><h2 className="font-bold">Ledger activity types</h2>{Object.entries(report.ledger.byKind).map(([kind,value])=><div key={kind} className="mt-3 flex justify-between gap-3 border-b border-white/5 pb-3 text-sm"><span>{kind.replaceAll("_"," ")} · {value.entries}</span><strong>{Object.entries(value.amountByCurrency).map(([currency,amount])=>formatMoney(amount,currency)).join(" / ")}</strong></div>)}</section>
              <section className="rounded-2xl border border-white/10 bg-[#07143d] p-5"><h2 className="font-bold">Advertising events</h2>{Object.entries(report.advertising.byEvent).map(([event,count])=><div key={event} className="mt-3 flex justify-between gap-3 border-b border-white/5 pb-3 text-sm"><span>{event.replaceAll("_"," ")}</span><strong>{count}</strong></div>)}</section>
            </div>
            {Object.values(report.truncated).some(Boolean) ? <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs text-amber-100">Some source collections reached the query limit. This report is partial; export or paginate source records before using it for reconciliation.</p> : null}
            <p className="mt-5 text-xs leading-6 text-blue-100/40">{report.note}</p>
          </> : null}
        </div>}
      </section>
    </main>
  );
}
