import { useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Compass,
  Search,
  LayoutDashboard,
  UploadCloud,
  FileCheck,
  Inbox,
  Tv,
  Radio,
  Film,
  Layers,
  Shield,
  Trophy,
  Users,
  Video,
  Building2,
  UserCheck,
  Wallet,
  CreditCard,
  Banknote,
  DollarSign,
  Receipt,
  FileSpreadsheet,
  Megaphone,
  Gift,
  Share2,
  Bell,
  FileText,
  AlertTriangle,
  Scale,
  ShieldAlert,
  Lock,
  History,
  Activity,
  HardDrive,
  Settings,
  FlaskConical,
  ExternalLink,
  ChevronRight,
  BookOpen,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/where-is-everything")({
  component: WhereIsEverythingRoute,
  head: () => ({
    meta: [
      { title: "Where is Everything in Zillionaire | Platform Directory" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type ConsoleSection = {
  id: string;
  name: string;
  path: string;
  category: "overview" | "content" | "users" | "finance" | "marketing" | "legal" | "system";
  module: string;
  description: string;
  whatLivesThere: string[];
  whoCanAccess: string;
  icon: typeof LayoutDashboard;
};

const SECTIONS: ConsoleSection[] = [
  // 1. Overview & Workload
  {
    id: "overview",
    name: "Mission Control Overview",
    path: "/zillionaire",
    category: "overview",
    module: "system",
    description: "Real-time command center, key performance metrics, and urgent system alerts.",
    whatLivesThere: [
      "Real-time viewer numbers and concurrent streams",
      "Gross and net watch-minute revenue tickers",
      "Urgent attention queues (payouts, reports, verifications)",
      "System service health and latency diagnostics",
    ],
    whoCanAccess: "All console operators (data scoped to active role permissions)",
    icon: LayoutDashboard,
  },
  {
    id: "where-is-everything",
    name: "Where is Everything Directory",
    path: "/zillionaire/where-is-everything",
    category: "overview",
    module: "system",
    description: "Complete master index of all console screens, permissions, and features.",
    whatLivesThere: [
      "Directory of all 40+ management screens",
      "Module permission breakdown for team operators",
      "Quick-jump navigation to every tool",
    ],
    whoCanAccess: "All console operators",
    icon: Compass,
  },

  // 2. Content, Channels & Broadcast
  {
    id: "approvals",
    name: "Approvals Inbox",
    path: "/zillionaire/approvals",
    category: "content",
    module: "moderation",
    description: "Centralized review queue for videos, live feeds, artwork, and change requests.",
    whatLivesThere: [
      "Unified SLA review queue with overdue countdowns",
      "Single-item and bulk approve, reject, and request-changes actions",
      "Filter by item type (video, live stream, change request, payout)",
    ],
    whoCanAccess: "Moderation or Content module operators",
    icon: Inbox,
  },
  {
    id: "pending-uploads",
    name: "Pending Uploads Queue",
    path: "/zillionaire/approvals?type=video",
    category: "content",
    module: "content",
    description: "Producer submitted content assets awaiting catalog approval.",
    whatLivesThere: [
      "Uploaded video assets, trailers, and posters",
      "Rights declarations and distribution proof uploads",
      "Age maturity ratings and per-minute pricing assignment",
    ],
    whoCanAccess: "Content module operators and Owner",
    icon: UploadCloud,
  },
  {
    id: "change-requests",
    name: "Change Requests (Approve then Go Live)",
    path: "/zillionaire/approvals?type=change_request",
    category: "content",
    module: "moderation",
    description: "Partner channel updates with 2-step approval and atomic go-live rollout.",
    whatLivesThere: [
      "Submitted channel detail, artwork, and stream changes",
      "Before and after diff viewer with masked secrets",
      "Two-step approval state (Approved, waiting to go live)",
      "One-click atomic Go Live and rollback restoration",
    ],
    whoCanAccess: "Moderation or Content module operators",
    icon: FileCheck,
  },
  {
    id: "channels",
    name: "Channels Control & Wizard",
    path: "/zillionaire/channels",
    category: "content",
    module: "channels",
    description: "The only place channels are created and assigned to licensed broadcast partners.",
    whatLivesThere: [
      "Channel creation wizard (sole place channels can be created)",
      "Channel ID generation (CH-Crockford) and public slug routing",
      "Partner organization assignment by verified corporate email",
      "Territory broadcast rules and stream health",
    ],
    whoCanAccess: "Channels module operators and Owner",
    icon: Tv,
  },
  {
    id: "live-tv",
    name: "Live TV Streams",
    path: "/zillionaire/live-tv",
    category: "content",
    module: "video",
    description: "Live linear broadcast streams, HLS feeds, and operational monitoring.",
    whatLivesThere: [
      "Active live broadcast feeds and ingest endpoints",
      "Stream bitrate, audio presence, and resolution monitoring",
      "EPG electronic program guide schedules",
    ],
    whoCanAccess: "Video module operators",
    icon: Radio,
  },
  {
    id: "movies",
    name: "Movies & VOD Catalog",
    path: "/zillionaire/movies",
    category: "content",
    module: "content",
    description: "Catalog asset manager for full-length films, documentaries, and specials.",
    whatLivesThere: [
      "Film metadata, genres, audio tracks, and subtitles",
      "Content moderation flags and DMCA status",
      "Playback analytics and view-count auditing",
    ],
    whoCanAccess: "Content module operators",
    icon: Film,
  },
  {
    id: "series",
    name: "Series & Episodic Content",
    path: "/zillionaire/series",
    category: "content",
    module: "content",
    description: "Taxonomy management for multi-episode series, seasons, and serial shows.",
    whatLivesThere: [
      "Series metadata, season grouping, and episode ordering",
      "Episode upload linking and thumbnail assignment",
      "Series release scheduling",
    ],
    whoCanAccess: "Content module operators",
    icon: Layers,
  },
  {
    id: "rights-review",
    name: "Rights & Licensing Review",
    path: "/zillionaire/rights-review",
    category: "content",
    module: "content",
    description: "Verification of legal copyright ownership, licenses, and distributor contracts.",
    whatLivesThere: [
      "Uploaded chain-of-title documents and copyright proof",
      "License expiration dates and territorial coverage",
      "Producer rights verification status",
    ],
    whoCanAccess: "Content module operators and Legal compliance",
    icon: Shield,
  },
  {
    id: "sports",
    name: "Sports Hub Control",
    path: "/zillionaire/sports",
    category: "content",
    module: "sports",
    description: "Sports competitions, league standings, knockout brackets, and live fixtures.",
    whatLivesThere: [
      "Competition creation (Leagues and Tournament cups)",
      "Official standings calculation (PTS, GD, GF, GA)",
      "Knockout tournament brackets (Round of 16 through Final)",
      "Fixture scheduling and live stream linking",
    ],
    whoCanAccess: "Sports module operators",
    icon: Trophy,
  },

  // 3. Users, Identity & Partners
  {
    id: "viewers",
    name: "Viewers Directory",
    path: "/zillionaire/viewers",
    category: "users",
    module: "viewers",
    description: "Registered viewer accounts, wallet balances, locked country, and activity.",
    whatLivesThere: [
      "Viewer profiles with Crockford Public IDs (BQ-V-)",
      "Locked country and auto-detected network evidence",
      "Wallet balances, top-up histories, and active sessions",
      "Account suspension and risk flag controls",
    ],
    whoCanAccess: "Viewers module operators",
    icon: Users,
  },
  {
    id: "producers",
    name: "Producers Directory",
    path: "/zillionaire/producers",
    category: "users",
    module: "content",
    description: "Independent creator profiles, public IDs, upload stats, and public links.",
    whatLivesThere: [
      "Producer profiles with Crockford IDs (BQ-P-)",
      "Catalog count, total watch minutes, and follower counts",
      "Public profile URLs (/p/$slug)",
      "Identity verification status and payout readiness",
    ],
    whoCanAccess: "Content module operators",
    icon: Video,
  },
  {
    id: "providers",
    name: "Providers (Partner Companies)",
    path: "/zillionaire/providers",
    category: "users",
    module: "providers",
    description: "Licensed broadcast companies, corporate emails, and assigned channels.",
    whatLivesThere: [
      "Partner company directory with Crockford IDs (BQ-C-)",
      "Assigned broadcast channels per provider",
      "Corporate email team invitations (Manager, Editor, Viewer)",
      "Partner balance summaries (percentages hidden from partner)",
    ],
    whoCanAccess: "Providers module operators and Owner",
    icon: Building2,
  },
  {
    id: "kyc",
    name: "KYC Verification Queue",
    path: "/zillionaire/kyc",
    category: "users",
    module: "compliance",
    description: "Identity verification, camera liveness check, and sanctions review.",
    whatLivesThere: [
      "Government ID verification across 193 jurisdictions",
      "Live camera capture and anti-spoof liveness review",
      "Encrypted document vault with 60s watermarked viewer",
      "Four-eyes dual approval enforcement for high-risk profiles",
    ],
    whoCanAccess: "Compliance module operators",
    icon: UserCheck,
  },

  // 4. Finance, Pricing & Payouts
  {
    id: "finance",
    name: "Finance Overview",
    path: "/zillionaire/finance",
    category: "finance",
    module: "finance",
    description: "Financial performance, gross revenue, net payout reserves, and tax totals.",
    whatLivesThere: [
      "Platform gross revenue across all currencies",
      "Net earnings accrued to producers and broadcast partners",
      "Currency breakdown (USD, NGN, GBP, EUR)",
      "Pay-per-minute watch consumption telemetry",
    ],
    whoCanAccess: "Finance module operators and Owner",
    icon: Wallet,
  },
  {
    id: "payouts",
    name: "Payouts Control & Settle",
    path: "/zillionaire/payouts",
    category: "finance",
    module: "finance",
    description: "Producer and partner withdrawals, bank wire batch export, and dual approval.",
    whatLivesThere: [
      "Pending withdrawal requests meeting minimum thresholds ($500+)",
      "ALAT / bank wire batch CSV export",
      "Four-eyes dual reviewer authorization for transactions >= $5,000",
      "Settlement receipt tracking and audit logging",
    ],
    whoCanAccess: "Finance module operators and Owner",
    icon: Banknote,
  },
  {
    id: "pricing",
    name: "Country Per-Minute Pricing Engine",
    path: "/zillionaire/pricing",
    category: "finance",
    module: "finance",
    description: "USD base per-minute rates, country multipliers, and RFC 4180 CSV matrix.",
    whatLivesThere: [
      "USD base rate setting ($0.05 / min default)",
      "193-country purchasing power parity multipliers",
      "Fixed rate overrides and film 90-minute equivalents",
      "Bulk percentage adjusters and RFC 4180 CSV import/export",
    ],
    whoCanAccess: "Finance module operators and Owner",
    icon: DollarSign,
  },
  {
    id: "splits-audit",
    name: "Revenue Splits & Audit",
    path: "/zillionaire/splits-audit",
    category: "finance",
    module: "finance",
    description: "Platform versus partner revenue percentages (strictly confidential).",
    whatLivesThere: [
      "Contractual percentage splits per channel",
      "Confidentiality safeguards ensuring partners never see percentages",
      "Dispute calculation ledgers and historical adjustments",
    ],
    whoCanAccess: "Platform Owner only",
    icon: FileSpreadsheet,
  },

  // 5. Compliance, Documents & Legal
  {
    id: "documents",
    name: "Documents Hub",
    path: "/zillionaire/pages",
    category: "legal",
    module: "settings",
    description: "Official legal documents, producer terms, partner contracts, and help policies.",
    whatLivesThere: [
      "All 4 document groups (Legal, Producer, Provider, Help/Trust)",
      "Status, version, effective date, published date, and scheduled releases",
      "Owner date editing controls (effective, published, scheduled)",
      "Unpublish, 1-tap Publish Defaults, and require re-acceptance toggle",
      "Markdown editor, live preview, version history, and 1-click rollback",
    ],
    whoCanAccess: "Platform Owner and System operators",
    icon: BookOpen,
  },
  {
    id: "copyright-cases",
    name: "DMCA Copyright Cases",
    path: "/zillionaire/copyright-cases",
    category: "legal",
    module: "moderation",
    description: "Takedown notices, counter-notices, repeat strikes, and catalog removals.",
    whatLivesThere: [
      "Viewer and rightsholder DMCA infringement reports",
      "Statutory counter-notice workflows with legal hold timers",
      "Actionable Keep, Remove, and Restore decision workflows",
      "Repeat infringer strike tracking",
    ],
    whoCanAccess: "Moderation and Legal compliance operators",
    icon: Scale,
  },
  {
    id: "fraud-watch",
    name: "Fraud Watch & Risk Engine",
    path: "/zillionaire/fraud-watch",
    category: "legal",
    module: "compliance",
    description: "Automated risk scoring, payment velocity limits, and proxy detection.",
    whatLivesThere: [
      "Suspicious top-up and velocity alerts",
      "Proxy, hosting, and anonymizer detection events",
      "Country mismatch flags (payment country vs locked country)",
      "Account security hold triggers",
    ],
    whoCanAccess: "Compliance and Security operators",
    icon: ShieldAlert,
  },

  // 6. System & Infrastructure
  {
    id: "audit",
    name: "Security Audit Log",
    path: "/zillionaire/audit",
    category: "system",
    module: "system",
    description: "Immutable security event trail, access denials, and step-up MFA logs.",
    whatLivesThere: [
      "Chronological ledger of every administrative action",
      "Step-up MFA re-authentication records",
      "Privacy-safe access denial audit events",
      "Before and after payload diff snapshots",
    ],
    whoCanAccess: "Security operators and Owner",
    icon: History,
  },
  {
    id: "test-lab",
    name: "Diagnostic Test Lab",
    path: "/zillionaire/test-lab",
    category: "system",
    module: "video",
    description: "Automated video stream inspection, manifest validation, and playback tests.",
    whatLivesThere: [
      "HLS manifest parsing and segment reachability checks",
      "Codec, resolution, bitrate, and audio channel verification",
      "SSRF-safe synthetic stream testing",
    ],
    whoCanAccess: "Video and System operators",
    icon: FlaskConical,
  },
  {
    id: "settings",
    name: "Platform Settings",
    path: "/zillionaire/settings",
    category: "system",
    module: "system",
    description: "Global feature flags, currency exchange rates, and system switches.",
    whatLivesThere: [
      "Global feature flag toggles",
      "Exchange rate provider configuration",
      "Maintenance mode and broadcast notice controls",
    ],
    whoCanAccess: "Platform Owner only",
    icon: Settings,
  },
];

function WhereIsEverythingRoute() {
  return (
    <ConsolePageGuard
      module="system"
      title="Where is Everything"
      description="Interactive directory of all console sections, permissions, and operational tools."
    >
      {({ token, account }) => <WhereIsEverythingDashboard account={account} />}
    </ConsolePageGuard>
  );
}

function WhereIsEverythingDashboard({ account }: { account: ConsoleAccount }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const categories = [
    { id: "all", label: "All Sections", count: SECTIONS.length },
    { id: "overview", label: "Overview & Queue", count: SECTIONS.filter((s) => s.category === "overview").length },
    { id: "content", label: "Content & Broadcast", count: SECTIONS.filter((s) => s.category === "content").length },
    { id: "users", label: "Users & Identity", count: SECTIONS.filter((s) => s.category === "users").length },
    { id: "finance", label: "Finance & Payouts", count: SECTIONS.filter((s) => s.category === "finance").length },
    { id: "legal", label: "Legal & Documents", count: SECTIONS.filter((s) => s.category === "legal").length },
    { id: "system", label: "System & Ops", count: SECTIONS.filter((s) => s.category === "system").length },
  ];

  const filteredSections = useMemo(() => {
    return SECTIONS.filter((s) => {
      if (selectedCategory !== "all" && s.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.path.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.module.toLowerCase().includes(q) ||
          s.whatLivesThere.some((item) => item.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [selectedCategory, searchQuery]);

  return (
    <ConsoleShell consoleType="zillionaire" title="Console Directory" account={account} activePath="/zillionaire/where-is-everything">
      <div className="space-y-6 p-6">
        <ConsoleWelcomeBanner
          title="Where is Everything in Zillionaire?"
          description="The complete console directory. Locate every tool, view role access requirements, and inspect the operational responsibilities of each module."
        />

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                  selectedCategory === cat.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <span>{cat.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-mono ${
                  selectedCategory === cat.id ? "bg-black/20 text-white" : "bg-muted text-foreground"
                }`}>
                  {cat.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by tool name, path, module, or feature…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Sections Grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-foreground">{sec.name}</h3>
                        <span className="font-mono text-[10px] text-muted-foreground">{sec.path}</span>
                      </div>
                    </div>
                    <ConsoleStatusBadge status="draft" label={sec.module} />
                  </div>

                  <p className="text-xs text-foreground/80 leading-relaxed mb-4">
                    {sec.description}
                  </p>

                  <div className="space-y-1.5 border-t border-border/50 pt-3">
                    <span className="text-[11px] font-bold text-foreground">What lives here:</span>
                    <ul className="space-y-1">
                      {sec.whatLivesThere.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <span className="text-primary font-bold">·</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-5 border-t border-border/50 pt-3 flex items-center justify-between">
                  <div className="text-[10px] text-muted-foreground max-w-[180px] truncate" title={sec.whoCanAccess}>
                    <span className="font-semibold text-foreground/70">Access:</span> {sec.whoCanAccess}
                  </div>
                  <a
                    href={sec.path}
                    className="flex items-center gap-1 rounded-lg bg-primary/10 hover:bg-primary hover:text-primary-foreground px-3 py-1.5 text-xs font-semibold text-primary transition"
                  >
                    <span>Open</span>
                    <ChevronRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ConsoleShell>
  );
}
