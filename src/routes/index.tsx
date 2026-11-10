import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, CirclePlay, Clapperboard, Clock3, RadioTower, ShieldCheck, Wallet, Tv2 } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({
    meta: [
      { title: "BQ SQWAD TV — Watch on your terms" },
      { name: "description", content: "A pay-as-you-go entertainment platform for live channels, programmes and replays. Coming soon." },
      { property: "og:title", content: "BQ SQWAD TV — Watch on your terms" },
      { property: "og:description", content: "Discover live channels, programmes and replays with a clear, pay-as-you-go viewing experience." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const features = [
  { icon: Wallet, title: "Pay as you watch", text: "A transparent wallet experience designed around the time you actually spend watching." },
  { icon: Clock3, title: "Know your spend", text: "See your viewing rate, session estimate and remaining time while you watch." },
  { icon: Tv2, title: "One connected experience", text: "Discover channels, schedules and replays across the website and Android app." },
];

const steps = [
  ["01", "Create your account", "Set up your profile and viewing preferences."],
  ["02", "Choose what to watch", "Explore channels and programmes available in your region."],
  ["03", "Stay in control", "Your wallet and viewing session are designed to keep costs clear."],
];

function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#07080c] text-white">
      <div className="pointer-events-none fixed inset-0 -z-0" aria-hidden="true">
        <div className="absolute -top-64 left-1/2 h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-[#4b168f]/20 blur-[130px]" />
        <div className="absolute right-[-12rem] top-[36rem] h-[28rem] w-[28rem] rounded-full bg-[#ffc21c]/10 blur-[110px]" />
      </div>

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-6 sm:px-8">
        <a href="/" className="flex items-center gap-3" aria-label="BQ SQWAD TV home">
          <img src="/brand/bq-sqwad-tv-logo.svg" alt="BQ SQWAD TV — Watch, Stream, Enjoy" className="h-14 w-auto max-w-[230px] object-contain" />
        </a>
        <nav className="hidden items-center gap-8 text-sm text-white/65 md:flex">
          <a className="transition hover:text-white" href="#experience">Experience</a>
          <a className="transition hover:text-white" href="#how-it-works">How it works</a>
          <a className="transition hover:text-white" href="#producers">For producers</a>
        </nav>
        <a href="#coming-soon" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-[#ffc21c]/60 hover:text-[#ffc21c]">
          Get updates
        </a>
      </header>

      <section className="relative z-10 mx-auto grid min-h-[660px] max-w-7xl items-center gap-14 px-5 pb-24 pt-16 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:pt-20">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#ffc21c]/25 bg-[#ffc21c]/[0.07] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#ffc21c]">
            <span className="h-2 w-2 rounded-full bg-[#ffc21c]" /> A new way to watch
          </div>
          <h1 className="max-w-3xl text-5xl font-black leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl">
            Entertainment.<br />
            <span className="bg-gradient-to-r from-[#ffc21c] to-[#ffe078] bg-clip-text text-transparent">On your terms.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/60">
            Discover a pay-as-you-go viewing experience built to make your channels, programmes and viewing costs easier to understand.
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <a href="#experience" className="inline-flex items-center gap-2 rounded-full bg-[#ffc21c] px-6 py-3.5 font-bold text-[#1b1203] transition hover:bg-[#ffe078]">
              Explore the experience <ArrowRight size={18} />
            </a>
            <a href="#how-it-works" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold text-white transition hover:border-white/40">
              <CirclePlay size={18} /> How it works
            </a>
          </div>
          <p className="mt-5 text-xs text-white/35">Launching in stages. Availability and content will depend on location and distribution rights.</p>
        </div>

        <div className="relative mx-auto w-full max-w-[520px]">
          <div className="absolute -inset-5 rounded-[2.5rem] bg-gradient-to-br from-[#ffc21c]/15 via-[#4b168f]/15 to-transparent blur-2xl" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#10131d]/90 p-4 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between border-b border-white/10 px-2 pb-4">
              <div className="flex items-center gap-2 text-sm font-bold"><Clapperboard size={17} className="text-[#ffc21c]" /> Your viewing space</div>
              <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200">Preview</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex min-h-48 flex-col justify-between rounded-2xl border border-white/10 bg-gradient-to-br from-[#25143a] via-[#160d25] to-[#10131d] p-5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#ffc21c]"><RadioTower size={14} /> CHANNEL DISCOVERY</div>
                <div><p className="text-2xl font-black">Find your next watch.</p><p className="mt-1 text-sm text-white/50">Channels, schedules and replays in one place.</p></div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <Wallet className="mb-5 text-[#ffc21c]" size={22} />
                <p className="text-sm font-bold">Clear wallet</p><p className="mt-1 text-xs leading-5 text-white/45">Know what your session costs.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <ShieldCheck className="mb-5 text-[#ffc21c]" size={22} />
                <p className="text-sm font-bold">Account controls</p><p className="mt-1 text-xs leading-5 text-white/45">Profile and viewing safeguards.</p>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-3 text-center text-xs text-white/40">
              Preview interface — live channels are not enabled yet
            </div>
          </div>
        </div>
      </section>

      <section id="experience" className="relative z-10 border-y border-white/[0.07] bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffc21c]">Built around the viewer</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">More clarity from discovery to playback.</h2>
            <p className="mt-4 leading-7 text-white/55">The platform is being developed around straightforward discovery, transparent session information and secure account services.</p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-3xl border border-white/10 bg-[#11141e]/80 p-7">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#ffc21c]/10 text-[#ffc21c]"><Icon size={23} /></span>
                <h3 className="mt-6 text-xl font-bold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-white/50">{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffc21c]">Simple by design</p>
        <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">A clearer way to get started.</h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map(([number, title, text]) => (
            <div key={number} className="border-t border-white/15 pt-6">
              <span className="text-sm font-black tracking-widest text-[#ffc21c]">{number}</span>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-white/50">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="producers" className="relative z-10 mx-auto max-w-7xl px-5 pb-24 sm:px-8">
        <div className="flex flex-col justify-between gap-8 rounded-[2rem] border border-[#ffc21c]/20 bg-gradient-to-br from-[#21112f] to-[#111522] p-8 sm:p-12 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#ffc21c]">For content producers</p>
            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Bring your channel to the conversation.</h2>
            <p className="mt-4 leading-7 text-white/55">Producer onboarding, channel management and earnings tools are part of the platform roadmap. Content is enabled only after rights and approval checks.</p>
          </div>
          <div className="shrink-0 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white/70">Producer console — coming soon</div>
        </div>
      </section>

      <footer id="coming-soon" className="relative z-10 border-t border-white/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-9 text-sm text-white/40 sm:px-8 md:flex-row md:items-center md:justify-between">
          <span className="font-bold tracking-[0.14em] text-white/70">BQ SQWAD TV</span>
          <span>© {new Date().getFullYear()} Bq sqwad technologies. All rights reserved.</span>
          <span>Updates and launch information coming soon.</span>
        </div>
      </footer>
    </main>
  );
}
