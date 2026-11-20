import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ConsoleShell } from "@/components/ConsoleShell";
import {
  BookOpen,
  Search,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  HelpCircle,
  Tv,
  Shield,
  FileText,
  DollarSign,
  Sparkles,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/provider/docs")({
  component: ProviderDocsPage,
  head: () => ({
    meta: [
      { title: "Partner Documentation & Guides | BQ SQWAD TV" },
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
        title: "Account Types & Verification",
        summary: "Partner account registration, commercial verification, and personal creator onboarding.",
        content: `BQ SQWAD TV supports verified commercial broadcasters and independent channel operators. Verified partner registration requires valid corporate registration documentation or national identification. Upon approval by compliance review, accounts receive full broadcast and settlement portal access.`,
      },
      {
        id: "going-live",
        title: "Going Live & Review SLA",
        summary: "Channel submission review timeline, status monitoring, and automatic broadcasting.",
        content: `All newly submitted channels undergo compliance verification and technical manifest validation within 24 to 48 hours. Once approved, channels transition to active status immediately according to configured programming schedules.`,
      },
    ],
  },
  {
    id: "integrating-a-channel",
    title: "Channel Integration",
    icon: Tv,
    articles: [
      {
        id: "channel-details",
        title: "Channel Metadata & Branding",
        summary: "Display naming, category tags, language definitions, and 16:9 artwork requirements.",
        content: `Configure descriptive metadata for viewer discoverability: official display title, primary language, content category, and high-resolution artwork (16:9 landscape backdrop and 1:1 square icon).`,
      },
      {
        id: "stream-source",
        title: "HLS Stream Source Standards",
        summary: "HTTP Live Streaming manifest requirements, H.264/AAC encoding, and GOP intervals.",
        content: `Primary feeds must be delivered via public HTTPS endpoints as standard HLS master playlists (.m3u8). Codec specifications: H.264 video at 1080p/720p with 2.0-second closed GOP cadence, AAC-LC stereo audio at 128 kbps or 192 kbps.`,
      },
      {
        id: "backup-source",
        title: "Secondary Backup Ingest",
        summary: "Configuring redundant failover endpoints to prevent broadcast interruptions.",
        content: `Partners can designate an isolated backup stream URL. The edge delivery fabric automatically switches to the secondary endpoint if primary segment retrieval fails, ensuring zero interruption for active viewers.`,
      },
      {
        id: "bandwidth-cap",
        title: "Edge Bandwidth Provisioning",
        summary: "Dedicated edge capacity allocations and concurrent viewer throughput.",
        content: `Channels are provisioned with dedicated multi-gigabit edge bandwidth (standard 8.0 Gbps allocation). Capacity auto-scales during high-demand live broadcast events.`,
      },
      {
        id: "test-stream",
        title: "Automated Stream Validation",
        summary: "Pre-flight validation verifying segment retrieval, timestamps, and audio sync.",
        content: `Before submitting for review, partners must initiate an automated stream test inside the console. The test validates playlist syntax, audio/video synchronization, and edge latency.`,
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
        summary: "Appropriate rating tags (G, PG, 13+, 16+, 18+) across all broadcast items.",
        content: `Every broadcast stream must carry a valid classification tag. Viewers under 18 or in Kids Safe Mode are automatically isolated from mature material.`,
      },
      {
        id: "adult-flag",
        title: "Adult Content Designation & Kids Lockout",
        summary: "Mandatory adult flagging, age verification gating, and advertising restrictions.",
        content: `Mature content requires explicit adult flagging. The platform locks under-18 viewer accounts to Kids Mode, preventing discovery, search results, or live playback of mature channels. Adult channels may never host youth-directed advertising.`,
      },
    ],
  },
  {
    id: "rights-licences",
    title: "Rights & Copyright",
    icon: FileText,
    articles: [
      {
        id: "rights-and-licences",
        title: "Licence Verification & Territory Rights",
        summary: "Broadcasting documentation, authorized territories, and agreement timeframes.",
        content: `Broadcasters must verify broadcast distribution rights for designated geographic regions. Expiration alerts notify partners 30 days prior to contract renewals.`,
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
        summary: "Verified watch time session auditing, monthly statements, and payouts.",
        content: `Earnings are determined strictly through server-authoritative playback metering and settled according to your agreement terms. Statements are generated on the 1st of every month for review.`,
      },
    ],
  },
  {
    id: "promotion-growth",
    title: "Promotions & Trending",
    icon: Sparkles,
    articles: [
      {
        id: "trending-promotions",
        title: "Sponsored Trending Placements",
        summary: "Discoverability packages, home carousel features, and transparent Sponsored badges.",
        content: `Partners can schedule featured placements on the viewer home screen. All sponsored carousels clearly display a 'Sponsored' badge to preserve viewer trust.`,
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
        summary: "Mandatory authenticator app TOTP codes for sensitive account modifications.",
        content: `Protect your channel ingest credentials and settlement details by enrolling in two-step verification using Google Authenticator or compatible TOTP applications.`,
      },
    ],
  },
];

function ProviderDocsPage() {
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
    const url = `${window.location.origin}/provider/docs#${anchor}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(anchor);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <ConsoleShell
      consoleType="provider"
      title="Partner Documentation"
      tagline="Technical ingest standards, compliance policies, and operational guides"
      activePath="/provider/docs"
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Search header */}
        <div className="p-6 rounded-2xl bg-card border border-border/70 shadow-sm relative overflow-hidden">
          <div className="relative z-10 max-w-2xl space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-primary" />
              <span>Partner Knowledge Base & Technical Docs</span>
            </h1>
            <p className="text-sm text-muted-foreground">
              Official reference for stream ingest, technical parameters, child protection rules, and settlement procedures.
            </p>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search articles (e.g. HLS pull, age rating, settlement, backup source)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
        </div>

        {/* Content layout */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Sidebar table of contents */}
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
