import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  BookOpen,
  Search,
  ExternalLink,
  HelpCircle,
  Tv,
  Shield,
  FileText,
  DollarSign,
  Sparkles,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/producer/docs")({
  component: ProducerDocsPage,
  head: () => ({
    meta: [
      { title: "Creator Documentation & Guides | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface DocSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  articles: Array<{
    id: string;
    title: string;
    summary: string;
    content: string;
  }>;
}

const DOCS_SECTIONS: DocSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: HelpCircle,
    articles: [
      {
        id: "account-types",
        title: "Creator Onboarding & Guidelines",
        summary: "Creator account registration, verification, and first steps.",
        content: `Welcome to the BQ SQWAD TV Creator Platform. Creators can distribute independent series, movies, and programmed linear channels directly to engaged audiences across web and mobile apps.`,
      },
      {
        id: "going-live",
        title: "Publishing Your Work",
        summary: "Content review workflows, processing, and public availability.",
        content: `Uploaded videos and channel schedules undergo automated quality checks and compliance inspection before public availability. Standard processing completes within 24 hours.`,
      },
    ],
  },
  {
    id: "content-channels",
    title: "Content & Scheduling",
    icon: Tv,
    articles: [
      {
        id: "uploading-content",
        title: "Video Upload Standards",
        summary: "Supported video codecs, resolution limits, and subtitle tracks.",
        content: `Upload high-definition master files in MP4 or MOV container formats (H.264 or ProRes). Include stereo AAC audio and optional SRT/VTT subtitle tracks.`,
      },
      {
        id: "schedule-slots",
        title: "Programme Scheduling",
        summary: "Scheduling episodes and movies back-to-back without overlap.",
        content: `Arrange your content catalogue into structured programming schedules. Programmes must be arranged contiguously with zero time overlaps.`,
      },
    ],
  },
  {
    id: "child-protection",
    title: "Age Ratings & Child Safety",
    icon: Shield,
    articles: [
      {
        id: "age-rating",
        title: "Content Classification Standards",
        summary: "Appropriate rating tags (G, PG, 13+, 16+, 18+) across all titles.",
        content: `Every movie and series must carry an accurate age classification. Viewers under 18 or in Kids Safe Mode are automatically isolated from mature material.`,
      },
      {
        id: "adult-flag",
        title: "Mature Content Requirements",
        summary: "Explicit adult flagging, age gating, and restricted delivery.",
        content: `Mature themes require an explicit adult rating tag. The platform restricts youth viewer profiles from searching or watching adult-tagged content.`,
      },
    ],
  },
  {
    id: "earnings-settlement",
    title: "Earnings & Settlement",
    icon: DollarSign,
    articles: [
      {
        id: "settlement-rules",
        title: "Settlement According to Agreement",
        summary: "Audited watch sessions and regular payouts.",
        content: `Creator revenue is tracked from verified watch duration and settled according to your agreement terms. Statements are updated regularly in your creator dashboard.`,
      },
    ],
  },
  {
    id: "promotion-growth",
    title: "Promotion & Discoverability",
    icon: Sparkles,
    articles: [
      {
        id: "trending-promotions",
        title: "Featured Placements",
        summary: "Promote your premiere or top series on the viewer home screen.",
        content: `Boost audience reach by scheduling featured promotions. All promoted titles carry a clear 'Sponsored' label on carousels.`,
      },
    ],
  },
  {
    id: "security",
    title: "Account Security",
    icon: Lock,
    articles: [
      {
        id: "two-step-verification",
        title: "Two-Step Verification (2FA)",
        summary: "Protect your creator account and payout credentials.",
        content: `Enable two-step verification using a standard authenticator app to protect your uploaded assets and settlement details.`,
      },
    ],
  },
];

function ProducerDocsPage() {
  const [search, setSearch] = useState("");
  const [activeSectionId, setActiveSectionId] = useState("getting-started");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredSections = DOCS_SECTIONS.map((section) => ({
    ...section,
    articles: section.articles.filter(
      (a) =>
        a.title.toLowerCase().includes(search.toLowerCase()) ||
        a.summary.toLowerCase().includes(search.toLowerCase()) ||
        a.content.toLowerCase().includes(search.toLowerCase()),
    ),
  })).filter((s) => s.articles.length > 0);

  const copyAnchor = (anchor: string) => {
    const url = `${window.location.origin}/producer/docs#${anchor}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(anchor);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <ConsoleShell
      consoleType="producer"
      title="Creator Documentation"
      tagline="Video standards, scheduling tools, policies, and monetization guides"
      activePath="/producer/docs"
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Search header */}
        <div className="p-6 rounded-2xl bg-card border border-border/70 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" />
              <span>Creator Knowledge Base & Guidelines</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Official guide for video uploads, programming schedules, rating standards, and earnings.
            </p>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search creator guides (e.g. video formats, age rating, settlement)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* Content layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="md:col-span-1 space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-3 mb-2">
              Topics
            </div>
            {DOCS_SECTIONS.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSectionId === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setActiveSectionId(sec.id);
                    setSearch("");
                  }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{sec.title}</span>
                </button>
              );
            })}
          </div>

          {/* Main article list */}
          <div className="md:col-span-3 space-y-8">
            {filteredSections.map((sec) => (
              <div key={sec.id} className="space-y-4">
                <div className="border-b border-border/60 pb-2">
                  <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <sec.icon className="w-4 h-4 text-primary" />
                    <span>{sec.title}</span>
                  </h2>
                </div>
                <div className="space-y-4">
                  {sec.articles.map((art) => (
                    <article
                      key={art.id}
                      id={art.id}
                      className="p-5 rounded-xl border border-border/60 bg-card/60 hover:bg-card/90 transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-foreground text-base">
                          {art.title}
                        </h3>
                        <button
                          type="button"
                          onClick={() => copyAnchor(art.id)}
                          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                          title="Copy link to section"
                        >
                          {copiedId === art.id ? (
                            <span className="text-emerald-500 font-medium">Copied!</span>
                          ) : (
                            <>
                              <span>Share</span>
                              <ExternalLink className="w-3 h-3" />
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        {art.summary}
                      </p>
                      <div className="text-xs text-foreground/80 leading-relaxed pt-2 border-t border-border/40">
                        {art.content}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
