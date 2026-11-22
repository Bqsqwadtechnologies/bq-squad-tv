import { DeltaResult } from "@/lib/delta";
import { BackButton } from "./BackButton";
import React, { useState, useEffect, useMemo, ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  LayoutDashboard,
  Compass,
  Users,
  Briefcase,
  Radio,
  Tv,
  Film,
  UploadCloud,
  MessageSquare,
  Landmark,
  CreditCard,
  Wallet,
  ArrowUpRight,
  Tag,
  Receipt,
  Megaphone,
  Sparkles,
  Bell,
  Share2,
  ShieldCheck,
  Trophy,
  ShieldAlert,
  Lock,
  FileCheck,
  FlaskConical,
  AlertTriangle,
  Ban,
  FileText,
  Database,
  Server,
  Sliders,
  Inbox,
  BarChart3,
  Settings,
  Code2,
  LogOut,
  Search,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  Sun,
  Moon,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Eye,
  Trash2,
  CheckCircle2,
  Calendar,
  PlayCircle,
  BadgeCheck,
  Flame,
  AlertCircle,
  ExternalLink,
  Globe,
  LayoutGrid,
  Scale,
  CheckSquare,
  Fingerprint,
  FileArchive,
  MessageSquareText,
  Mail,
  Activity,
  Smartphone,
  Calculator,
  BookOpen,
} from "lucide-react";

export type ConsoleType = "zillionaire" | "producer" | "provider";

export interface ConsoleAccount {
  email?: string;
  isOwner?: boolean;
  roles?: string[];
  modules?: string[];
  producerPlanActive?: boolean;
  providerId?: string | null;
}

export interface ConsoleNavItem {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  module?: string;
  external?: boolean;
}

export interface ConsoleNavGroup {
  id: string;
  title?: string;
  items: ConsoleNavItem[];
}

export interface ViewAsConfig {
  activeOrgOrUid: string;
  label: string;
  options: Array<{ id: string; label: string; detail?: string }>;
  onSelect: (id: string) => void;
  onReset: () => void;
}

export interface ChannelSwitcherConfig {
  activeChannelId: string;
  channels: Array<{ id: string; name: string; iconUrl?: string }>;
  onSelect: (channelId: string) => void;
}

export interface EarningsTickerConfig {
  amount: string;
  label?: string;
  delta?: DeltaResult | null;
  changePercent?: string;
}

export interface ConsoleShellProps {
  consoleType: ConsoleType;
  title: string;
  tagline: string;
  account?: ConsoleAccount;
  activePath?: string;
  onLock?: () => void;
  onLogout?: () => void;
  unreadNotificationsCount?: number;
  groups?: ConsoleNavGroup[];
  children: ReactNode;
  actions?: ReactNode;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  viewAs?: ViewAsConfig;
  channelSwitcher?: ChannelSwitcherConfig;
  earningsTicker?: EarningsTickerConfig;
  lastUpdated?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function ConsoleShell({
  consoleType,
  title,
  tagline,
  account,
  activePath = "",
  onLock,
  onLogout,
  unreadNotificationsCount = 0,
  groups: customGroups,
  children,
  actions,
  searchPlaceholder = "Search across users, channels, videos, payments...",
  onSearch,
  viewAs,
  channelSwitcher,
  earningsTicker,
  lastUpdated,
  onRefresh,
  isRefreshing = false,
}: ConsoleShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("bq_console_theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("bq_console_theme", next);
  };

  const defaultZillionaireGroups: ConsoleNavGroup[] = useMemo(
    () => [
      {
        id: "overview",
        items: [
          {
            id: "overview",
            label: "Overview",
            href: "/zillionaire",
            icon: LayoutDashboard,
  Compass,
  BookOpen,
          },
          {
            id: "pending-uploads",
            label: "Pending uploads",
            href: "/zillionaire/approvals?type=video",
            icon: UploadCloud,
            module: "content",
          },
          {
            id: "change-requests",
            label: "Change requests",
            href: "/zillionaire/approvals?type=change_request",
            icon: FileCheck,
            module: "moderation",
          },
          {
            id: "approvals",
            label: "Approvals inbox",
            href: "/zillionaire/approvals",
            icon: Inbox,
            module: "moderation",
          },
        ],
      },
      {
        id: "people",
        title: "People",
        items: [
          {
            id: "viewers",
            label: "Viewers",
            href: "/zillionaire/viewers",
            icon: Users,
            module: "users",
          },
          {
            id: "producers",
            label: "Producers",
            href: "/zillionaire/producers",
            icon: Briefcase,
            module: "producers",
          },
          {
            id: "providers",
            label: "Providers",
            href: "/zillionaire/providers",
            icon: Radio,
            module: "providers",
          },
          {
            id: "team",
            label: "Team and roles",
            href: "/zillionaire/team",
            icon: ShieldAlert,
            module: "roles",
          },
        ],
      },
      {
        id: "catalogue",
        title: "Catalogue",
        items: [
          {
            id: "analytics",
            label: "Numbers",
            href: "/zillionaire/analytics",
            icon: BarChart3,
            module: "overview",
          },
          {
            id: "channels",
            label: "Channels",
            href: "/zillionaire/channels",
            icon: Tv,
            module: "channels",
          },
          {
            id: "live-tv",
            label: "Live TV",
            href: "/zillionaire/live-tv",
            icon: Flame,
            module: "channels",
          },
          {
            id: "movies",
            label: "Movies",
            href: "/zillionaire/movies",
            icon: Film,
            module: "catalog",
          },
          {
            id: "series",
            label: "Series & seasons",
            href: "/zillionaire/series",
            icon: Film,
            module: "catalog",
          },
          {
            id: "upload-studio",
            label: "Upload studio",
            href: "/zillionaire/upload-studio",
            icon: UploadCloud,
            module: "video",
          },
          {
            id: "rights-review",
            label: "Rights review",
            href: "/zillionaire/rights-review",
            icon: ShieldCheck,
            module: "content",
          },
          {
            id: "comments",
            label: "Comments & ratings",
            href: "/zillionaire/comments",
            icon: MessageSquare,
            module: "moderation",
          },
          {
            id: "content-calendar",
            label: "Content calendar",
            href: "/zillionaire/content-calendar",
            icon: Calendar,
            module: "content",
          },
          {
            id: "geo-rules",
            label: "Geo rules",
            href: "/zillionaire/geo-rules",
            icon: Globe,
            module: "content",
          },
          {
            id: "trending-rails",
            label: "Trending & rails",
            href: "/zillionaire/trending-rails",
            icon: LayoutGrid,
            module: "content",
          },
          {
            id: "search-tuning",
            label: "Search tuning",
            href: "/zillionaire/search-tuning",
            icon: Search,
            module: "catalog",
          },
          {
            id: "sports",
            label: "Sports Hub",
            href: "/zillionaire/sports",
            icon: Trophy,
            module: "sports",
          },
        ],
      },
      {
        id: "money",
        title: "Money",
        items: [
          {
            id: "finance",
            label: "Finance control",
            href: "/zillionaire/finance",
            icon: Landmark,
            module: "finance",
          },
          {
            id: "payments",
            label: "Payments",
            href: "/zillionaire/payments",
            icon: CreditCard,
            module: "finance",
          },
          {
            id: "wallets",
            label: "Wallets",
            href: "/zillionaire/wallets",
            icon: Wallet,
            module: "finance",
          },
          {
            id: "payouts",
            label: "Payouts",
            href: "/zillionaire/payouts",
            icon: ArrowUpRight,
            module: "finance",
          },
          {
            id: "pricing",
            label: "Pricing & rules",
            href: "/zillionaire/pricing",
            icon: Tag,
            module: "pricing",
          },
          {
            id: "receipts",
            label: "Receipts",
            href: "/zillionaire/receipts",
            icon: Receipt,
            module: "finance",
          },
          {
            id: "collaborations",
            label: "Collaborations",
            href: "/zillionaire/collaborations",
            icon: Users,
            module: "finance",
          },
          {
            id: "splits-audit",
            label: "Splits audit",
            href: "/zillionaire/splits-audit",
            icon: Calculator,
            module: "finance",
          },
        ],
      },
      {
        id: "growth",
        title: "Growth",
        items: [
          {
            id: "ads",
            label: "Advertising",
            href: "/zillionaire/ads",
            icon: Megaphone,
            module: "ads",
          },
          {
            id: "promotions",
            label: "Promotions",
            href: "/zillionaire/promotions",
            icon: Sparkles,
            module: "ads",
          },
          {
            id: "referrals",
            label: "Referrals",
            href: "/zillionaire/referrals",
            icon: Users,
            module: "finance",
          },
          {
            id: "notifications",
            label: "Notifications",
            href: "/zillionaire/notifications",
            icon: Bell,
            module: "overview",
          },
        ],
      },
      {
        id: "testing",
        title: "Testing",
        items: [
          { id: "test-lab", label: "Test Lab", href: "/zillionaire/test-lab", icon: FlaskConical, module: "video" },
        ],
      },
      {
        id: "trust",
        title: "Trust and safety",
        items: [
          {
            id: "moderation",
            label: "Moderation",
            href: "/zillionaire/moderation",
            icon: ShieldCheck,
            module: "moderation",
          },
          {
            id: "security",
            label: "Security events",
            href: "/zillionaire/security",
            icon: Lock,
            module: "roles",
          },
          {
            id: "audit",
            label: "Audit log",
            href: "/zillionaire/audit",
            icon: FileCheck,
            module: "roles",
          },
          {
            id: "errors",
            label: "Error centre",
            href: "/zillionaire/errors",
            icon: AlertTriangle,
            module: "system",
          },
          {
            id: "blocked",
            label: "Blocked content",
            href: "/zillionaire/blocked-content",
            icon: Ban,
            module: "moderation",
          },
          {
            id: "copyright-cases",
            label: "Copyright cases",
            href: "/zillionaire/copyright-cases",
            icon: Scale,
            module: "moderation",
          },
          {
            id: "strikes-appeals",
            label: "Strikes & appeals",
            href: "/zillionaire/strikes-appeals",
            icon: ShieldAlert,
            module: "security",
          },
          {
            id: "moderation-workload",
            label: "Moderator workload",
            href: "/zillionaire/moderation-workload",
            icon: CheckSquare,
            module: "moderation",
          },
          {
            id: "fraud-watch",
            label: "Fraud & abuse",
            href: "/zillionaire/fraud-watch",
            icon: Fingerprint,
            module: "security",
          },
          {
            id: "privacy-requests",
            label: "Data privacy requests",
            href: "/zillionaire/privacy-requests",
            icon: FileArchive,
            module: "security",
          },
        ],
      },
      {
        id: "platform",
        title: "Platform",
        items: [
          {
            id: "pages",
            label: "Documents",
            href: "/zillionaire/pages",
            icon: BookOpen,
            module: "settings",
          },
          {
            id: "storage",
            label: "Storage",
            href: "/zillionaire/storage",
            icon: Database,
            module: "storage",
          },
          {
            id: "cleanup-sample",
            label: "Clean up sample content",
            href: "/zillionaire/cleanup-sample",
            icon: Trash2,
            module: "system",
          },
          {
            id: "delivery",
            label: "Delivery & HLS",
            href: "/zillionaire/delivery",
            icon: Server,
            module: "delivery",
          },
          {
            id: "features",
            label: "Feature controls",
            href: "/zillionaire/features",
            icon: Sliders,
            module: "settings",
          },
          {
            id: "support",
            label: "Support inbox",
            href: "/zillionaire/support",
            icon: Inbox,
            module: "support",
          },
          {
            id: "reports",
            label: "Reports",
            href: "/zillionaire/reports",
            icon: BarChart3,
            module: "reports",
          },
          {
            id: "settings",
            label: "Settings",
            href: "/zillionaire/settings",
            icon: Settings,
            module: "settings",
          },
          {
            id: "schema",
            label: "Data structure",
            href: "/zillionaire/firebase-schema",
            icon: Code2,
            module: "system",
          },
          {
            id: "announcements",
            label: "Announcements",
            href: "/zillionaire/announcements",
            icon: Megaphone,
            module: "pages",
          },
          {
            id: "support-macros",
            label: "Support macros",
            href: "/zillionaire/support-macros",
            icon: MessageSquareText,
            module: "support",
          },
          {
            id: "scheduled-reports",
            label: "Scheduled reports",
            href: "/zillionaire/scheduled-reports",
            icon: Mail,
            module: "reports",
          },
          {
            id: "status-page",
            label: "Status page editor",
            href: "/zillionaire/status-page",
            icon: Activity,
            module: "settings",
          },
          {
            id: "releases",
            label: "App releases & lock",
            href: "/zillionaire/releases",
            icon: Smartphone,
            module: "settings",
          },
        ],
      },
    ],
    [],
  );

  const defaultProducerGroups: ConsoleNavGroup[] = useMemo(
    () => [
      {
        id: "main",
        items: [
          {
            id: "producer-overview",
            label: "Dashboard",
            href: "/producer",
            icon: LayoutDashboard,
  Compass,
  BookOpen,
          },
          {
            id: "producer-channels",
            label: "My Channels",
            href: "/producer/channels",
            icon: Tv,
          },
          {
            id: "producer-collaborations",
            label: "Collaborations",
            href: "/producer/collaborations",
            icon: Briefcase,
          },
          {
            id: "producer-team",
            label: "Team & Scopes",
            href: "/producer/team",
            icon: Users,
          },
          {
            id: "producer-terms",
            label: "Terms & Agreement",
            href: "/producer-terms",
            icon: FileText,
          },
          {
            id: "producer-docs",
            label: "Guides & Docs",
            href: "/producer/docs",
            icon: BookOpen,
          },
        ],
      },
    ],
    [],
  );

  const defaultProviderGroups: ConsoleNavGroup[] = useMemo(
    () => [
      {
        id: "main",
        items: [
          {
            id: "provider-overview",
            label: "Portal Overview",
            href: "/provider",
            icon: LayoutDashboard,
  Compass,
  BookOpen,
          },
          {
            id: "provider-channels",
            label: "Live Feeds & Channels",
            href: "/provider/channels",
            icon: Radio,
          },
          {
            id: "provider-contracts",
            label: "Contracts & Licenses",
            href: "/provider/contracts",
            icon: FileCheck,
          },
          {
            id: "provider-statements",
            label: "Statements & Payouts",
            href: "/provider/statements",
            icon: Receipt,
          },
          {
            id: "provider-disputes",
            label: "Disputes & Support",
            href: "/provider/disputes",
            icon: AlertCircle,
          },
          {
            id: "provider-playback",
            label: "Playback Monitor",
            href: "/provider#playback",
            icon: PlayCircle,
          },
          {
            id: "provider-team",
            label: "Team & Access",
            href: "/provider/team",
            icon: Users,
          },
          {
            id: "provider-docs",
            label: "Guides & Docs",
            href: "/provider/docs",
            icon: BookOpen,
          },
        ],
      },
    ],
    [],
  );

  const rawGroups =
    customGroups ||
    (consoleType === "zillionaire"
      ? defaultZillionaireGroups
      : consoleType === "producer"
        ? defaultProducerGroups
        : defaultProviderGroups);

  // Filter items by module permissions if zillionaire and not owner
  const filteredGroups = useMemo(() => {
    if (consoleType !== "zillionaire" || account?.isOwner) {
      return rawGroups;
    }
    const userModules = new Set(account?.modules || []);
    return rawGroups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => {
          if (!item.module) return true;
          return userModules.has(item.module);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [consoleType, account, rawGroups]);

  const allItems = useMemo(() => {
    return filteredGroups.flatMap((g) => g.items);
  }, [filteredGroups]);

  const consoleBadge =
    consoleType === "zillionaire"
      ? { label: "Control Centre", color: "border-cyan-500/30 text-cyan-400 bg-cyan-950/40" }
      : consoleType === "producer"
        ? {
            label: "Producer Studio",
            color: "border-purple-500/30 text-purple-400 bg-purple-950/40",
          }
        : {
            label: "Provider Portal",
            color: "border-emerald-500/30 text-emerald-400 bg-emerald-950/40",
          };

  const handleGlobalSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && searchQuery.trim()) {
      onSearch(searchQuery.trim());
      setSearchModalOpen(false);
    }
  };

  return (
    <div
      className={`min-h-screen font-sans ${
        theme === "dark" ? "bg-[#050914] text-slate-100 dark" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* "View As" Banner for Owner support */}
      {viewAs && (
        <div className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-gradient-to-r from-amber-950/90 to-amber-900/90 px-4 py-2.5 text-xs font-semibold text-amber-200 shadow-lg backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span>
              SUPPORT VIEW AS: <strong className="text-white">{viewAs.label}</strong> (Read-Only
              Mode, Audited)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={viewAs.activeOrgOrUid}
              onChange={(e) => viewAs.onSelect(e.target.value)}
              className="rounded-lg border border-amber-400/40 bg-black/60 px-2.5 py-1 text-xs text-amber-100 outline-none focus:ring-1 focus:ring-amber-400"
            >
              {viewAs.options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label} {opt.detail ? `(${opt.detail})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={viewAs.onReset}
              className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300 hover:bg-amber-500/30 transition"
            >
              Exit View As
            </button>
          </div>
        </div>
      )}

      <div className="flex min-h-screen">
        {/* Desktop Sidebar (Collapsed rail on tablet, full width on desktop) */}
        <aside
          className={`hidden md:flex flex-col md:w-20 lg:w-64 shrink-0 border-r transition-all duration-300 z-30 ${
            theme === "dark"
              ? "bg-[#060b1b] border-blue-950/40 text-slate-300"
              : "bg-white border-slate-200 text-slate-700 shadow-sm"
          }`}
        >
          {/* Brand & Console Badge */}
          <div className="p-5 border-b border-white/5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <a
                href={consoleType === "zillionaire" ? "/zillionaire" : `/${consoleType}`}
                className="block"
              >
                <BrandLogo variant="horizontal" className="h-7 w-auto" />
              </a>
              <span
                className={`text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-full border ${consoleBadge.color}`}
              >
                {consoleBadge.label}
              </span>
            </div>
            {account?.email && (
              <span className="text-[11px] text-slate-400 truncate">{account.email}</span>
            )}
            {account?.publicId && (
              <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-cyan-300">
                <span>{account.publicId}</span>
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(account.publicId!)}
                  className="rounded px-1 text-[9px] bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"
                  title="Copy Public ID"
                >
                  Copy
                </button>
              </div>
            )}
          </div>

          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
            {filteredGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {group.title && (
                  <h4 className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 hidden lg:block">
                    {group.title}
                  </h4>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      activePath === item.href ||
                      (item.href !== "/zillionaire" &&
                        item.href !== "/producer" &&
                        item.href !== "/provider" &&
                        activePath.startsWith(item.href));

                    return (
                      <a
                        key={item.id}
                        href={item.href}
                        className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                          isActive
                            ? "bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30"
                            : theme === "dark"
                              ? "text-slate-300 hover:bg-white/5 hover:text-white"
                              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? "text-white"
                                : theme === "dark"
                                  ? "text-slate-400 group-hover:text-blue-400"
                                  : "text-slate-500 group-hover:text-blue-600"
                            }`}
                          />
                          <span className="truncate hidden lg:inline">{item.label}</span>
                        </div>
                        {item.badge !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                              isActive ? "bg-white/20 text-white" : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </a>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Sidebar Footer Controls */}
          <div className="p-3 border-t border-white/5 space-y-2">
            {consoleType === "zillionaire" && onLock && (
              <button
                onClick={onLock}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Lock Console</span>
              </button>
            )}

            {onLogout && (
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Log Out</span>
              </button>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Header Bar */}
          <header
            className={`sticky top-0 z-20 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b backdrop-blur-md transition-colors ${
              theme === "dark"
                ? "bg-[#060b1b]/90 border-blue-950/40"
                : "bg-white/90 border-slate-200"
            }`}
          >
            {/* Mobile menu button & Title */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-1.5 rounded-lg border border-slate-700/40 text-slate-300 hover:bg-white/5"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              {activePath && !["/zillionaire", "/producer", "/provider"].includes(activePath) ? (
                <BackButton
                  to={
                    consoleType === "producer"
                      ? "/producer"
                      : consoleType === "provider"
                        ? "/provider"
                        : "/zillionaire"
                  }
                  label="Back"
                  className="inline-flex"
                />
              ) : (
                <BackButton
                  to="/"
                  label="App"
                  className="inline-flex"
                />
              )}
              <div>
                <h1 className="text-base sm:text-lg font-bold tracking-tight truncate">{title}</h1>
                <p className="text-[11px] text-slate-400 truncate hidden sm:block">{tagline}</p>
              </div>
            </div>

            {/* Top Bar Actions */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Channel Switcher */}
              {channelSwitcher && channelSwitcher.channels.length > 0 && (
                <div className="relative hidden sm:block">
                  <select
                    value={channelSwitcher.activeChannelId}
                    onChange={(e) => channelSwitcher.onSelect(e.target.value)}
                    className="h-8 rounded-xl border border-cyan-500/30 bg-[#0a1435] px-3 text-xs font-semibold text-cyan-200 outline-none hover:border-cyan-400"
                  >
                    {channelSwitcher.channels.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#060b1b] text-white">
                        📺 {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Earnings / Balance Ticker */}
              {earningsTicker && (
                <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs font-semibold shadow-inner">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{earningsTicker.label || "Revenue"}: {earningsTicker.amount}</span>
                  {earningsTicker.changePercent && (
                    <span className="text-[10px] text-emerald-400 font-bold">{earningsTicker.changePercent}</span>
                  )}
                  {earningsTicker.delta?.formatted && earningsTicker.delta.direction === "up" && (
                    <span className="text-[10px] text-emerald-400 font-bold">{earningsTicker.delta.formatted}</span>
                  )}
                  {earningsTicker.delta?.formatted && earningsTicker.delta.direction === "down" && (
                    <span className="text-[10px] text-rose-400 font-bold">{earningsTicker.delta.formatted}</span>
                  )}
                </div>
              )}

              {/* Global Search Input / Button */}
              <button
                onClick={() => setSearchModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs transition border ${
                  theme === "dark"
                    ? "bg-[#0b132b]/80 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                    : "bg-slate-100 border-slate-200 text-slate-500 hover:bg-slate-200/80"
                }`}
                title="Global Search"
              >
                <Search className="h-3.5 w-3.5 text-blue-400" />
                <span className="hidden md:inline text-[11px] max-w-[200px] truncate">
                  {searchPlaceholder}
                </span>
                <kbd className="hidden lg:inline text-[10px] px-1 py-0.5 rounded bg-black/20 text-slate-400 border border-white/5">
                  ⌘K
                </kbd>
              </button>

              {/* Refresh Button */}
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  disabled={isRefreshing}
                  className={`p-2 rounded-xl border text-xs font-medium transition flex items-center gap-1.5 ${
                    theme === "dark"
                      ? "bg-[#0b132b] border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                      : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                  }`}
                  title={lastUpdated ? `Last updated: ${lastUpdated}` : "Refresh Data"}
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`}
                  />
                  {lastUpdated && (
                    <span className="hidden xl:inline text-[10px] text-slate-400">
                      {lastUpdated}
                    </span>
                  )}
                </button>
              )}

              {/* Theme Toggle Button */}
              <button
                onClick={toggleTheme}
                className={`p-2 rounded-xl border transition ${
                  theme === "dark"
                    ? "bg-[#0b132b] border-slate-800 text-amber-300 hover:bg-white/5"
                    : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                }`}
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>

              {/* Notification Bell */}
              <div className="relative">
                <button
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  className={`relative p-2 rounded-xl border transition ${
                    theme === "dark"
                      ? "bg-[#0b132b] border-slate-800 text-slate-300 hover:text-white"
                      : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200"
                  }`}
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationsCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white shadow">
                      {unreadNotificationsCount}
                    </span>
                  )}
                </button>

                {/* Notifications Panel Dropdown */}
                {notificationsOpen && (
                  <div
                    className={`absolute right-0 mt-2 w-80 rounded-2xl border p-4 shadow-xl z-50 ${
                      theme === "dark"
                        ? "bg-[#091126] border-slate-800 text-slate-200"
                        : "bg-white border-slate-200 text-slate-800"
                    }`}
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Notifications
                      </span>
                      <span className="text-[11px] text-blue-400">
                        {unreadNotificationsCount} unread
                      </span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <p className="font-semibold text-slate-100">Live Channels Uptime</p>
                        <p className="text-[11px] text-slate-400">
                          All registered EPG and HLS channels healthy.
                        </p>
                      </div>
                      <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                        <p className="font-semibold text-slate-100">Storage Fabric Budget</p>
                        <p className="text-[11px] text-slate-400">
                          Current shard quota well within verified limits.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Profile Avatar & Menu */}
              <div className="relative">
                <button
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className="flex items-center gap-2 p-1 pl-2 rounded-xl border border-transparent hover:border-slate-700/40 transition"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-cyan-400 text-white font-bold text-xs shadow-sm">
                    {account?.email ? (account.email.charAt(0) || "U").toUpperCase() : "U"}
                  </div>
                  <ChevronDown className="h-3 w-3 text-slate-400 hidden sm:block" />
                </button>

                {profileDropdownOpen && (
                  <div
                    className={`absolute right-0 mt-2 w-56 rounded-2xl border p-2 shadow-2xl z-50 ${
                      theme === "dark"
                        ? "bg-[#091126] border-slate-800 text-slate-200"
                        : "bg-white border-slate-200 text-slate-800"
                    }`}
                  >
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-xs font-bold truncate">{account?.email || "Signed In"}</p>
                      {account?.publicId && (
                        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-cyan-300">
                          <span>{account.publicId}</span>
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard?.writeText(account.publicId!)}
                            className="rounded px-1 text-[9px] bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white"
                            title="Copy Public ID"
                          >
                            Copy
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400">
                        {account?.isOwner
                          ? "Platform Owner"
                          : account?.roles?.join(", ") || "Console User"}
                      </p>
                    </div>

                    <div className="py-1">
                      {consoleType === "zillionaire" && onLock && (
                        <button
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            onLock();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 rounded-xl transition"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          <span>Lock Console</span>
                        </button>
                      )}

                      {onLogout && (
                        <button
                          onClick={() => {
                            setProfileDropdownOpen(false);
                            onLogout();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 rounded-xl transition"
                        >
                          <LogOut className="h-3.5 w-3.5" />
                          <span>Log Out</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {actions}
            </div>
          </header>

          {/* Main Content Body */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
            {children}
          </main>

          {/* Mobile Bottom Tab Bar */}
          <div
            className={`md:hidden sticky bottom-0 z-30 flex items-center justify-around border-t py-2 px-1 backdrop-blur-lg ${
              theme === "dark"
                ? "bg-[#060b1b]/95 border-blue-950/40 text-slate-400"
                : "bg-white/95 border-slate-200 text-slate-600 shadow-lg"
            }`}
          >
            {allItems.slice(0, 4).map((item) => {
              const Icon = item.icon;
              const isActive = activePath === item.href;
              return (
                <a
                  key={item.id}
                  href={item.href}
                  className={`flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium transition ${
                    isActive ? "text-blue-500 font-bold" : "hover:text-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate max-w-[60px]">{item.label}</span>
                </a>
              );
            })}
            <button
              onClick={() => setMobileMoreOpen(true)}
              className="flex flex-col items-center gap-1 py-1 px-3 rounded-lg text-[10px] font-medium hover:text-slate-200"
            >
              <Menu className="h-4 w-4" />
              <span>More</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile "More" Sheet Drawer */}
      {mobileMoreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70 backdrop-blur-sm md:hidden">
          <div
            className={`max-h-[85vh] overflow-y-auto rounded-t-3xl border-t p-6 shadow-2xl ${
              theme === "dark"
                ? "bg-[#091126] border-slate-800 text-slate-200"
                : "bg-white border-slate-200 text-slate-800"
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <BrandLogo variant="icon" className="h-6 w-6" />
                <h3 className="font-bold text-sm">All Console Navigation</h3>
              </div>
              <button
                onClick={() => setMobileMoreOpen(false)}
                className="p-1.5 rounded-lg border border-slate-700/40 text-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="py-4 space-y-6">
              {filteredGroups.map((group) => (
                <div key={group.id} className="space-y-1">
                  {group.title && (
                    <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-2">
                      {group.title}
                    </h5>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <a
                          key={item.id}
                          href={item.href}
                          onClick={() => setMobileMoreOpen(false)}
                          className="flex items-center gap-2.5 p-2.5 rounded-xl border border-white/5 bg-white/5 text-xs font-medium hover:bg-blue-600 hover:text-white transition"
                        >
                          <Icon className="h-4 w-4 text-blue-400" />
                          <span className="truncate">{item.label}</span>
                        </a>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/5 flex gap-2">
              {consoleType === "zillionaire" && onLock && (
                <button
                  onClick={() => {
                    setMobileMoreOpen(false);
                    onLock();
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs font-bold text-amber-300"
                >
                  Lock Console
                </button>
              )}
              {onLogout && (
                <button
                  onClick={() => {
                    setMobileMoreOpen(false);
                    onLogout();
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-bold text-red-300"
                >
                  Log Out
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Search Modal */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/70 backdrop-blur-sm">
          <div
            className={`w-full max-w-xl rounded-2xl border p-4 shadow-2xl ${
              theme === "dark"
                ? "bg-[#091126] border-slate-800 text-slate-100"
                : "bg-white border-slate-200 text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">
                Global Console Search
              </span>
              <button
                onClick={() => setSearchModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleGlobalSearchSubmit} className="mt-3 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder={searchPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-slate-700/60 bg-black/40 pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-500 transition shadow"
              >
                Search
              </button>
            </form>
            <div className="mt-4 space-y-1">
              <p className="text-[11px] font-semibold text-slate-400 mb-1">Quick Links</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {allItems.slice(0, 6).map((item) => (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={() => setSearchModalOpen(false)}
                    className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-blue-600 hover:text-white transition flex items-center gap-2"
                  >
                    <item.icon className="h-3.5 w-3.5 text-blue-400" />
                    <span className="truncate">{item.label}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   Console Shared Sub-components
   ========================================================================= */

export interface ConsoleWelcomeBannerProps {
  title: string;
  description: string;
  badgeText?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

export function ConsoleWelcomeBanner({
  title,
  description,
  badgeText,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: ConsoleWelcomeBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-r from-blue-900/40 via-[#0a1532] to-[#0d1c44] p-6 shadow-xl">
      <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1 max-w-2xl">
          {badgeText && (
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30 mb-1">
              {badgeText}
            </span>
          )}
          <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">{title}</h2>
          <p className="text-xs text-blue-200/80 leading-relaxed">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {actionLabel && (
            <button
              onClick={onAction}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg shadow-blue-600/30 transition flex items-center gap-1.5"
            >
              <span>{actionLabel}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
          {secondaryActionLabel && (
            <button
              onClick={onSecondaryAction}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/10 transition"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      </div>
      {/* Decorative background glow */}
      <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-blue-500/10 blur-2xl pointer-events-none" />
    </div>
  );
}

export type KpiVariant = "blue" | "purple" | "green" | "gold";

export interface ConsoleKpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  delta?: DeltaResult | null;
  caption?: string;
  change?: string | { value: string; positive?: boolean };
  trend?: "up" | "down" | "neutral";
  gradient?: KpiVariant;
  icon: React.ComponentType<{ className?: string }>;
  variant?: KpiVariant;
  onClick?: () => void;
}

export function ConsoleKpiCard({
  title,
  value,
  subtitle,
  delta,
  caption,
  change,
  trend,
  gradient,
  icon: Icon,
  variant,
  onClick,
}: ConsoleKpiCardProps) {
  const chosenVariant = variant || gradient || "blue";
  const styles = {
    blue: {
      border: "border-blue-500/20 hover:border-blue-500/40",
      bg: "bg-gradient-to-br from-[#0c1633]/90 to-[#070e22]/90",
      iconBg: "bg-blue-600/20 text-blue-400 border border-blue-500/30",
      glow: "from-blue-600/10",
    },
    purple: {
      border: "border-purple-500/20 hover:border-purple-500/40",
      bg: "bg-gradient-to-br from-[#170e2e]/90 to-[#0a071c]/90",
      iconBg: "bg-purple-600/20 text-purple-400 border border-purple-500/30",
      glow: "from-purple-600/10",
    },
    green: {
      border: "border-emerald-500/20 hover:border-emerald-500/40",
      bg: "bg-gradient-to-br from-[#0a1f1b]/90 to-[#061210]/90",
      iconBg: "bg-emerald-600/20 text-emerald-400 border border-emerald-500/30",
      glow: "from-emerald-600/10",
    },
    gold: {
      border: "border-amber-500/20 hover:border-amber-500/40",
      bg: "bg-gradient-to-br from-[#241a08]/90 to-[#120d04]/90",
      iconBg: "bg-amber-600/20 text-amber-400 border border-amber-500/30",
      glow: "from-amber-600/10",
    },
  }[chosenVariant];

  const rawChangeStr = typeof change === "string" ? change : change?.value;
  const isPositive = typeof change === "object" ? change.positive : !rawChangeStr?.startsWith("-");
  const descriptiveCaption = caption;

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className={`relative overflow-hidden rounded-2xl border p-5 transition-all duration-200 shadow-md ${
        styles.border
      } ${styles.bg} ${
        onClick ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.99]" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <p className="text-xl sm:text-2xl font-black text-white tracking-tight">{value}</p>
        </div>
        <div className={`p-2.5 rounded-xl ${styles.iconBg}`}>
          {React.isValidElement(Icon) ? Icon : (typeof Icon === "function" || typeof Icon === "object" ? React.createElement(Icon as any, { className: "h-5 w-5" }) : null)}
        </div>
      </div>

      {(subtitle || descriptiveCaption || change || (delta?.formatted && delta.direction !== "none" && delta.direction !== "neutral")) && (
        <div className="mt-3 flex items-center justify-between text-xs pt-2 border-t border-white/5">
          {change && (
            <div className={`flex items-center gap-1 font-bold text-[11px] ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
              {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{rawChangeStr}</span>
            </div>
          )}
          {delta?.formatted && delta.direction === "up" && (
            <div className="flex items-center gap-1 font-bold text-[11px] text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              <span>{delta.formatted}</span>
              {delta.caption && <span className="text-[10px] text-slate-400 font-normal ml-1">{delta.caption}</span>}
            </div>
          )}
          {delta?.formatted && delta.direction === "down" && (
            <div className="flex items-center gap-1 font-bold text-[11px] text-rose-400">
              <TrendingDown className="h-3 w-3" />
              <span>{delta.formatted}</span>
              {delta.caption && <span className="text-[10px] text-slate-400 font-normal ml-1">{delta.caption}</span>}
            </div>
          )}
          {delta?.formatted && delta.direction === "new" && (
            <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-400">
              <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-semibold border border-cyan-500/20">New</span>
              {delta.caption && <span className="text-[10px] text-slate-400 font-normal ml-1">{delta.caption}</span>}
            </div>
          )}
          {descriptiveCaption && !delta?.formatted && (
            <span className="text-[11px] text-slate-400">{descriptiveCaption}</span>
          )}
          {subtitle && <span className="text-[11px] text-slate-400 ml-auto">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

export interface ConsoleCardProps {
  title?: string;
  subtitle?: string;
  headerAction?: ReactNode;
  children: ReactNode;
  className?: string;
  loading?: boolean;
}

export function ConsoleCard({
  title,
  subtitle,
  headerAction,
  children,
  className = "",
  loading = false,
}: ConsoleCardProps) {
  return (
    <div
      className={`rounded-2xl border border-blue-950/40 bg-[#080f24]/90 p-5 shadow-lg backdrop-blur-sm ${className}`}
    >
      {(title || headerAction) && (
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-white/5 mb-4">
          <div>
            {title && <h3 className="text-sm font-bold text-white">{title}</h3>}
            {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          {headerAction}
        </div>
      )}
      {loading ? <ConsoleSkeletonLoader /> : children}
    </div>
  );
}

export interface ConsoleChartCardProps {
  title: string;
  subtitle?: string;
  periods?: string[];
  activePeriod?: string;
  onPeriodChange?: (period: string) => void;
  children: ReactNode;
}

export function ConsoleChartCard({
  title,
  subtitle,
  periods = ["24h", "7d", "30d", "All"],
  activePeriod = "7d",
  onPeriodChange,
  children,
}: ConsoleChartCardProps) {
  return (
    <div className="rounded-2xl border border-blue-950/40 bg-[#080f24]/90 p-5 shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/5 mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          {subtitle && <p className="text-[11px] text-slate-400">{subtitle}</p>}
        </div>
        {periods.length > 0 && onPeriodChange && (
          <div className="flex items-center gap-1 rounded-xl bg-black/40 border border-white/5 p-1">
            {periods.map((p) => (
              <button
                key={p}
                onClick={() => onPeriodChange(p)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition ${
                  activePeriod === p
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

export interface ActivityItem {
  id: string;
  title: string;
  subtitle?: string;
  timestamp?: string;
  status?: "success" | "warning" | "error" | "info";
  icon?: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}

export function ConsoleActivityList({ items }: { items: ActivityItem[] }) {
  if (!items || items.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-slate-400">No recent activity recorded.</div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => {
        const Icon = item.icon || CheckCircle2;
        return (
          <div
            key={item.id}
            onClick={item.onClick}
            role={item.onClick ? "button" : undefined}
            tabIndex={item.onClick ? 0 : undefined}
            className={`flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/[0.02] text-xs transition ${
              item.onClick ? "cursor-pointer hover:bg-white/5 hover:border-blue-500/30" : ""
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{item.title}</p>
                {item.subtitle && (
                  <p className="text-[11px] text-slate-400 truncate">{item.subtitle}</p>
                )}
              </div>
            </div>
            {item.timestamp && (
              <span className="text-[10px] text-slate-500 shrink-0 ml-3">{item.timestamp}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface ConsoleTableProps<T extends Record<string, unknown> = Record<string, unknown>> {
  columns: Array<{ key: string; label: string; className?: string }>;
  data: T[];
  onRowClick?: (row: T) => void;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
}

export function ConsoleTable<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription = "There are currently no items to display in this list.",
  emptyActionLabel,
  onEmptyAction,
}: ConsoleTableProps<T>) {
  if (loading) {
    return <ConsoleSkeletonLoader rows={5} />;
  }

  if (!data || data.length === 0) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="inline-flex p-3 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Search className="h-6 w-6" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">{emptyTitle}</h4>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">{emptyDescription}</p>
        </div>
        {emptyActionLabel && onEmptyAction && (
          <button
            onClick={onEmptyAction}
            className="px-4 py-2 rounded-xl bg-blue-600 text-xs font-bold text-white hover:bg-blue-500 transition shadow"
          >
            {emptyActionLabel}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/5 text-[11px] uppercase tracking-wider text-slate-400">
            {columns.map((col) => (
              <th key={col.key} className={`pb-3 font-bold ${col.className || ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {data.map((row, idx) => {
            const rawId = row["id"];
            const rowKey = typeof rawId === "string" || typeof rawId === "number" ? rawId : idx;
            return (
              <tr
                key={rowKey}
                onClick={() => onRowClick && onRowClick(row)}
                className={`group transition ${onRowClick ? "cursor-pointer hover:bg-white/5" : ""}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`py-3 text-slate-200 ${col.className || ""}`}>
                    {row[col.key] !== undefined && row[col.key] !== null
                      ? String(row[col.key])
                      : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ConsoleStatusBadge({
  status,
  label,
}: {
  status: "active" | "pending" | "resolved" | "suspended" | "failed" | "live" | "draft";
  label?: string;
}) {
  const configMap: Record<string, { bg: string }> = {
    active: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    live: { bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 animate-pulse" },
    pending: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    resolved: { bg: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    suspended: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    failed: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
    draft: { bg: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
  };
  const configs = configMap[status] ?? {
    bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${configs.bg}`}
    >
      {label || status}
    </span>
  );
}

export function ConsoleSkeletonLoader({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-xl bg-white/5 border border-white/5" />
      ))}
    </div>
  );
}
