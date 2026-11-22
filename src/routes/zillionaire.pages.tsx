import { useEffect, useState, useMemo, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  RotateCcw,
  Sparkles,
  Eye,
  Edit3,
  Calendar,
  Shield,
  Layers,
  Save,
  Send,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Split,
  RefreshCw,
  Search,
  BookOpen,
  Building2,
  UserCheck,
  Ban,
} from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/pages")({
  component: DocumentsHubRoute,
  head: () => ({
    meta: [
      { title: "Documents Hub | Policy & Legal Manager" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type DocumentCategory = "all" | "legal" | "producer" | "provider" | "help";

type LegalPageDoc = {
  slug: string;
  title: string;
  body: string;
  audience: "public" | "producer" | "provider";
  category?: "legal" | "producer" | "provider" | "help";
  status: "published" | "draft" | "scheduled";
  version: number;
  effectiveAt: string | null;
  publishedAt: string | null;
  scheduledPublishAt: string | null;
  requiresReacceptance: boolean;
  versions: Array<{
    version: number;
    title: string;
    body: string;
    status: string;
    effectiveAt?: string | null;
    publishedAt?: string | null;
    scheduledPublishAt?: string | null;
    changeSummary: string;
    createdAt: string;
    createdBy: string;
  }>;
  updatedAt: string | null;
  updatedBy: string | null;
  unfilledPlaceholders: string[];
};

const STANDARD_PLACEHOLDERS = [
  { key: "effective_date", label: "Effective Date", defaultVal: "To be confirmed" },
  { key: "last_updated", label: "Last Updated", defaultVal: "To be confirmed" },
  { key: "minimum_age", label: "Minimum Age", defaultVal: "To be confirmed" },
  { key: "viewing_history_retention", label: "Viewing History Retention", defaultVal: "To be confirmed" },
  { key: "evidence_retention", label: "Evidence Retention", defaultVal: "To be confirmed" },
  { key: "security_log_retention", label: "Security Log Retention", defaultVal: "To be confirmed" },
  { key: "dispute_window_days", label: "Dispute Window (Days)", defaultVal: "To be confirmed" },
  { key: "wallet_refund_rule", label: "Wallet Refund Rule", defaultVal: "To be confirmed" },
  { key: "closure_balance_rule", label: "Closure Balance Rule", defaultVal: "To be confirmed" },
  { key: "liability_period_months", label: "Liability Period (Months)", defaultVal: "To be confirmed" },
  { key: "governing_law", label: "Governing Law", defaultVal: "To be confirmed" },
  { key: "jurisdiction", label: "Jurisdiction", defaultVal: "To be confirmed" },
  { key: "postal_address_if_required", label: "Postal Address", defaultVal: "To be confirmed" },
  { key: "revenue_basis", label: "Revenue Basis", defaultVal: "To be confirmed" },
  { key: "revenue_change_notice_days", label: "Revenue Change Notice (Days)", defaultVal: "To be confirmed" },
  { key: "minimum_payout", label: "Minimum Payout", defaultVal: "To be confirmed" },
  { key: "contact_email", label: "Contact Email", defaultVal: "tv@bqsqwad.com" },
  { key: "legal_email", label: "Legal Email", defaultVal: "tv@bqsqwad.com" },
  { key: "company_name", label: "Company Name", defaultVal: "BQ Sqwad Technologies" },
  { key: "platform_name", label: "Platform Name", defaultVal: "BQ SQWAD TV" },
];

function DocumentsHubRoute() {
  return (
    <ConsolePageGuard
      module="system"
      title="Documents Hub"
      description="Manage, review, schedule, and publish official documents, policies, and contracts."
    >
      {({ token, account }) => <DocumentsHubDashboard token={token} account={account} />}
    </ConsolePageGuard>
  );
}

function DocumentsHubDashboard({ token }: { token: string; account: ConsoleAccount }) {
  const [pages, setPages] = useState<LegalPageDoc[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("privacy-policy");
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editor states
  const [editorTab, setEditorTab] = useState<"edit" | "preview" | "history" | "compare">("edit");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"public" | "producer" | "provider">("public");
  const [changeSummary, setChangeSummary] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [requiresReacceptance, setRequiresReacceptance] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<number | null>(null);

  // Async states
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishingDefaults, setIsPublishingDefaults] = useState(false);
  const [isUnpublishing, setIsUnpublishing] = useState(false);

  const activePage = useMemo(() => {
    return pages.find((p) => p.slug === selectedSlug) || null;
  }, [pages, selectedSlug]);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/pages/", {
        headers: await getWebAuthHeaders(token),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load documents.");
      setPages(data.pages || []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Sync active page into editor
  useEffect(() => {
    if (activePage) {
      setTitle(activePage.title);
      setBody(activePage.body);
      setAudience(activePage.audience);
      setChangeSummary("");
      setEffectiveAt(activePage.effectiveAt ? activePage.effectiveAt.slice(0, 10) : "");
      setPublishedAt(activePage.publishedAt ? activePage.publishedAt.slice(0, 16) : "");
      setScheduledPublishAt(activePage.scheduledPublishAt ? activePage.scheduledPublishAt.slice(0, 16) : "");
      setRequiresReacceptance(activePage.requiresReacceptance);
      if (activePage.versions.length > 0) {
        setSelectedHistoryVersion(activePage.versions[activePage.versions.length - 1]?.version ?? null);
      } else {
        setSelectedHistoryVersion(null);
      }
    }
  }, [activePage]);

  const insertPlaceholder = (key: string) => {
    const placeholder = `{{${key}}}`;
    setBody((prev) => prev + " " + placeholder);
  };

  const getDocCategory = (p: LegalPageDoc): "legal" | "producer" | "provider" | "help" => {
    if (p.category) return p.category;
    if (p.audience === "producer") return "producer";
    if (p.audience === "provider") return "provider";
    if (["help", "about", "contact", "data-protection"].includes(p.slug)) return "help";
    return "legal";
  };

  const filteredPages = useMemo(() => {
    return pages.filter((p) => {
      const cat = getDocCategory(p);
      if (selectedCategory !== "all" && cat !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          p.title.toLowerCase().includes(query) ||
          p.slug.toLowerCase().includes(query) ||
          p.body.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [pages, selectedCategory, searchQuery]);

  // Save Draft with editable dates
  const handleSaveDraft = async () => {
    if (!activePage) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/pages/", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          title,
          body,
          audience,
          category: getDocCategory(activePage),
          changeSummary: changeSummary.trim() || "Saved document draft",
          effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : null,
          publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          requiresReacceptance,
          reason: "Owner updated document metadata and content in Documents Hub",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save draft.");
      setStatusMessage(`Draft for "${title}" saved successfully.`);
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save draft.");
    }
  };

  // Publish Now / Schedule
  const handlePublish = async () => {
    if (!activePage) return;
    setIsPublishing(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      // Save the edited content first; never publish stale server-side text.
      const draftResponse = await fetch("/api/public/v1/zillionaire/pages/", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          title,
          body,
          audience,
          category: getDocCategory(activePage),
          changeSummary: changeSummary.trim() || "Pre-publish update",
          effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : new Date().toISOString(),
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          requiresReacceptance,
          reason: "Owner prepared draft before publication",
        }),
      });
      const draftData = await draftResponse.json();
      if (!draftResponse.ok) throw new Error(draftData.error || "Could not save the edited document.");

      const nowIso = new Date().toISOString();
      const res = await fetch("/api/public/v1/zillionaire/pages/publish", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          effectiveAt: effectiveAt ? new Date(effectiveAt).toISOString() : nowIso,
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          changeSummary: changeSummary.trim() || "Published updated document version",
          reason: "Owner published document in Documents Hub",
          requiresReacceptance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish document.");
      setStatusMessage(
        data.scheduled
          ? `Document scheduled to publish on ${new Date(scheduledPublishAt).toLocaleString()}`
          : `Document published live as Version ${data.version}!`
      );
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Publication failed.");
    } finally {
      setIsPublishing(false);
    }
  };

  // Unpublish
  const handleUnpublish = async () => {
    if (!activePage) return;
    setIsUnpublishing(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/pages/unpublish", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          reason: "Owner unpublished document and returned to draft in Documents Hub",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to unpublish.");
      setStatusMessage(`Document "${title}" unpublished and returned to draft.`);
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Unpublish failed.");
    } finally {
      setIsUnpublishing(false);
    }
  };

  // Publish Defaults in one click
  const handlePublishDefaults = async () => {
    setIsPublishingDefaults(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/pages/publish-defaults", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "Owner published all standard defaults in one tap from Documents Hub",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish defaults.");
      setStatusMessage(
        `All ${data.pages?.length || 19} standard documents published live!`
      );
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to publish defaults.");
    } finally {
      setIsPublishingDefaults(false);
    }
  };

  // Rollback to historical version
  const handleRollback = async (versionNumber: number) => {
    if (!activePage) return;
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/pages/rollback", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          targetVersion: versionNumber,
          reason: `Restored Version ${versionNumber} via Documents Hub`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to rollback.");
      setStatusMessage(`Restored Version ${versionNumber} as new published Version ${data.version}.`);
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Rollback failed.");
    }
  };

  const previewBody = useMemo(() => {
    let text = body;
    for (const ph of STANDARD_PLACEHOLDERS) {
      const regex = new RegExp(`\\{\\{\\s*${ph.key}\\s*\\}\\}`, "gi");
      text = text.replace(regex, ph.defaultVal);
    }
    return text;
  }, [body]);

  const comparedVersionDoc = useMemo(() => {
    if (!activePage || selectedHistoryVersion === null) return null;
    return activePage.versions.find((v) => v.version === selectedHistoryVersion) || null;
  }, [activePage, selectedHistoryVersion]);

  return (
    <ConsoleShell activePath="/zillionaire/pages">
      <div className="space-y-6 p-6">
        <ConsoleWelcomeBanner
          title="Documents Hub"
          description="Master repository of legal policies, producer contracts, provider terms, and help notices. Edit effective dates, scheduled releases, and manage one-tap default rollouts."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={loadPages}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
              <button
                type="button"
                onClick={handlePublishDefaults}
                disabled={isPublishingDefaults}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {isPublishingDefaults ? "Publishing Defaults…" : "Publish Defaults (1-Tap)"}
              </button>
            </div>
          }
        />

        {statusMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-400">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard
            title="Total Documents"
            value={pages.length.toString()}
            subtitle="Covering all 4 compliance groups"
            icon={<BookOpen className="h-5 w-5 text-primary" />}
          />
          <ConsoleKpiCard
            title="Published Live"
            value={pages.filter((p) => p.status === "published").length.toString()}
            subtitle="Active on public and partner routes"
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-400" />}
          />
          <ConsoleKpiCard
            title="Scheduled Releases"
            value={pages.filter((p) => p.status === "scheduled").length.toString()}
            subtitle="Queued for automated publication"
            icon={<Clock className="h-5 w-5 text-amber-400" />}
          />
          <ConsoleKpiCard
            title="Drafts In Progress"
            value={pages.filter((p) => p.status === "draft").length.toString()}
            subtitle="Safely isolated, pending go-live"
            icon={<Edit3 className="h-5 w-5 text-sky-400" />}
          />
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All Documents", count: pages.length },
              { id: "legal", label: "Legal Policies", count: pages.filter((p) => getDocCategory(p) === "legal").length },
              { id: "producer", label: "Producer Documents", count: pages.filter((p) => getDocCategory(p) === "producer").length },
              { id: "provider", label: "Provider Documents", count: pages.filter((p) => getDocCategory(p) === "provider").length },
              { id: "help", label: "Help & Data Protection", count: pages.filter((p) => getDocCategory(p) === "help").length },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id as DocumentCategory)}
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

          <div className="relative min-w-[240px]">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by title, slug, or content…"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Main 2-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Documents Directory */}
          <div className="lg:col-span-4 space-y-4">
            <ConsoleCard
              title="Document Registry"
              subtitle={`Showing ${filteredPages.length} documents`}
            >
              <div className="space-y-2 pt-2 max-h-[750px] overflow-y-auto pr-1">
                {filteredPages.map((p) => {
                  const isSelected = p.slug === selectedSlug;
                  const cat = getDocCategory(p);
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setSelectedSlug(p.slug)}
                      className={`flex w-full flex-col rounded-xl p-3.5 text-left transition ${
                        isSelected
                          ? "bg-primary/10 border-2 border-primary text-primary shadow-sm"
                          : "hover:bg-muted bg-card border border-border text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-semibold text-xs truncate">{p.title}</span>
                        <ConsoleStatusBadge
                          variant={
                            p.status === "published"
                              ? "success"
                              : p.status === "scheduled"
                              ? "warning"
                              : "neutral"
                          }
                        >
                          {p.status}
                        </ConsoleStatusBadge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground mt-1">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">/{p.slug}</span>
                        <span>·</span>
                        <span className="capitalize">{cat}</span>
                        <span>·</span>
                        <span className="font-semibold text-foreground/80">v{p.version}</span>
                      </div>

                      {/* Display Dates directly on each card */}
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border/40 text-[10px] text-muted-foreground">
                        <div>
                          <span className="text-foreground/60">Effective:</span>{" "}
                          <span className="text-foreground/90 font-medium">
                            {p.effectiveAt ? new Date(p.effectiveAt).toLocaleDateString() : "Pending"}
                          </span>
                        </div>
                        <div>
                          <span className="text-foreground/60">Published:</span>{" "}
                          <span className="text-foreground/90 font-medium">
                            {p.publishedAt ? new Date(p.publishedAt).toLocaleDateString() : (p.status === "published" ? "Live" : "Draft")}
                          </span>
                        </div>
                        {p.scheduledPublishAt && (
                          <div className="col-span-2 text-amber-400 font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>Next Publish: {new Date(p.scheduledPublishAt).toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </ConsoleCard>
          </div>

          {/* Right Column: Editor Workspace */}
          <div className="lg:col-span-8 space-y-4">
            {activePage ? (
              <ConsoleCard
                title={activePage.title}
                subtitle={`Public route: /legal/${activePage.slug}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/legal/${activePage.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Public
                    </a>
                    {activePage.status === "published" && (
                      <button
                        type="button"
                        onClick={handleUnpublish}
                        disabled={isUnpublishing}
                        className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20 transition"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        {isUnpublishing ? "Unpublishing…" : "Unpublish"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Save Draft
                    </button>
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition shadow-sm"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {isPublishing
                        ? "Publishing…"
                        : scheduledPublishAt
                        ? "Schedule Release"
                        : "Publish Live"}
                    </button>
                  </div>
                }
              >
                {/* Editor Navigation Tabs */}
                <div className="flex border-b border-border mb-4">
                  <button
                    type="button"
                    onClick={() => setEditorTab("edit")}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                      editorTab === "edit"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editor & Dates
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("preview")}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                      editorTab === "preview"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Live Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("history")}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                      editorTab === "history"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <History className="h-3.5 w-3.5" />
                    Version History ({activePage.versions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorTab("compare")}
                    className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                      editorTab === "compare"
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Split className="h-3.5 w-3.5" />
                    Compare Versions
                  </button>
                </div>

                {editorTab === "edit" && (
                  <div className="space-y-4">
                    {/* Metadata & Title */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          Document Title
                        </label>
                        <input
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          Target Audience
                        </label>
                        <select
                          value={audience}
                          onChange={(e) => setAudience(e.target.value as any)}
                          className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="public">Public (All viewers & visitors)</option>
                          <option value="producer">Producers (Content creators)</option>
                          <option value="provider">Providers (Licensed channels)</option>
                        </select>
                      </div>
                    </div>

                    {/* Owner Date Editing Panel (Rule N12.2) */}
                    <div className="rounded-xl border border-border/80 bg-muted/20 p-4">
                      <div className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
                        <Calendar className="h-4 w-4 text-primary" />
                        Official Date Controls (Owner Editable)
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-foreground mb-1">
                            Effective Date
                          </label>
                          <input
                            type="date"
                            value={effectiveAt}
                            onChange={(e) => setEffectiveAt(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            When policy takes legal force.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-foreground mb-1">
                            Published Date
                          </label>
                          <input
                            type="datetime-local"
                            value={publishedAt}
                            onChange={(e) => setPublishedAt(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            When first made visible publicly.
                          </p>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-foreground mb-1">
                            Scheduled Publish Date
                          </label>
                          <input
                            type="datetime-local"
                            value={scheduledPublishAt}
                            onChange={(e) => setScheduledPublishAt(e.target.value)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            Optional future automated release.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Placeholder Insertion Helper Chips */}
                    <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary" />
                        Click to insert standard policy placeholders:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {STANDARD_PLACEHOLDERS.map((ph) => (
                          <button
                            key={ph.key}
                            type="button"
                            onClick={() => insertPlaceholder(ph.key)}
                            className="rounded-lg border border-border bg-card px-2.5 py-1 text-[10px] font-mono hover:border-primary/50 hover:text-primary transition"
                          >
                            + &#123;&#123;{ph.key}&#125;&#125;
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Markdown Editor Area */}
                    <div>
                      <label className="block text-xs font-semibold text-foreground mb-1.5">
                        Markdown Content
                      </label>
                      <textarea
                        rows={16}
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="# Title

Content..."
                      />
                    </div>

                    {/* Change Summary and Re-acceptance Switch */}
                    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          Change Summary & Audit Note
                        </label>
                        <input
                          type="text"
                          value={changeSummary}
                          onChange={(e) => setChangeSummary(e.target.value)}
                          placeholder="e.g. Updated dispute resolution timeline and minimum thresholds"
                          className="w-full rounded-xl border border-border bg-background px-3.5 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>

                      <div className="flex items-center gap-2.5 pt-1">
                        <input
                          type="checkbox"
                          id="reacceptance"
                          checked={requiresReacceptance}
                          onChange={(e) => setRequiresReacceptance(e.target.checked)}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <label htmlFor="reacceptance" className="text-xs font-semibold text-foreground cursor-pointer">
                          Require user re-acceptance on next sign-in (affected role must accept this version before accessing platform)
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {editorTab === "preview" && (
                  <div className="rounded-xl border border-border bg-card p-6 min-h-[400px]">
                    <div className="border-b border-border pb-4 mb-6">
                      <h1 className="text-2xl font-black">{title}</h1>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span>Version {activePage.version || 1}</span>
                        <span>·</span>
                        <span>Audience: {audience}</span>
                        <span>·</span>
                        <span>Effective: {effectiveAt || new Date().toLocaleDateString()}</span>
                        {publishedAt && (
                          <>
                            <span>·</span>
                            <span>Published: {new Date(publishedAt).toLocaleString()}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-3 font-sans">
                      {previewBody.split("\n").map((line, idx) => {
                        const trimmed = line.trim();
                        if (!trimmed) return <div key={idx} className="h-2" />;
                        if (trimmed.startsWith("# ")) {
                          return (
                            <h2 key={idx} className="text-xl font-bold mt-4 mb-2">
                              {trimmed.slice(2)}
                            </h2>
                          );
                        }
                        if (trimmed.startsWith("## ")) {
                          return (
                            <h3 key={idx} className="text-base font-bold mt-3 mb-1.5">
                              {trimmed.slice(3)}
                            </h3>
                          );
                        }
                        if (trimmed.startsWith("- ")) {
                          return (
                            <li key={idx} className="ml-4 list-disc text-foreground/80">
                              {trimmed.slice(2)}
                            </li>
                          );
                        }
                        return (
                          <p key={idx} className="text-foreground/90">
                            {trimmed}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}

                {editorTab === "history" && (
                  <div className="space-y-3">
                    {activePage.versions.length === 0 ? (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No previous published versions recorded for this document.
                      </div>
                    ) : (
                      activePage.versions
                        .slice()
                        .reverse()
                        .map((ver) => (
                          <div
                            key={ver.version}
                            className="flex items-center justify-between rounded-xl border border-border bg-card p-4 transition hover:border-primary/30"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-foreground">
                                  Version {ver.version}
                                </span>
                                <ConsoleStatusBadge
                                  variant={ver.status === "published" ? "success" : "neutral"}
                                >
                                  {ver.status}
                                </ConsoleStatusBadge>
                              </div>
                              <p className="mt-1 text-xs text-foreground/90">
                                {ver.changeSummary || "Routine update"}
                              </p>
                              <div className="mt-1 text-[10px] text-muted-foreground">
                                Created {new Date(ver.createdAt).toLocaleString()} by{" "}
                                <span className="font-mono">{ver.createdBy?.slice(0, 8)}…</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedHistoryVersion(ver.version);
                                  setEditorTab("compare");
                                }}
                                className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-muted transition"
                              >
                                View / Compare
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRollback(ver.version)}
                                className="flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 transition"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Rollback
                              </button>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                )}

                {editorTab === "compare" && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-3">
                      <div className="text-xs font-semibold text-foreground">
                        Comparing Draft with Historical Version:
                      </div>
                      <select
                        value={selectedHistoryVersion ?? ""}
                        onChange={(e) => setSelectedHistoryVersion(Number(e.target.value))}
                        className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground"
                      >
                        {activePage.versions.map((v) => (
                          <option key={v.version} value={v.version}>
                            Version {v.version} ({new Date(v.createdAt).toLocaleDateString()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="font-bold text-xs text-primary mb-2 flex items-center gap-1.5">
                          <Edit3 className="h-3.5 w-3.5" />
                          Current Working Draft
                        </div>
                        <div className="max-h-[450px] overflow-y-auto font-mono text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                          {body}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-card p-4">
                        <div className="font-bold text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                          <History className="h-3.5 w-3.5" />
                          Historical Version {comparedVersionDoc?.version ?? "Selected"}
                        </div>
                        <div className="max-h-[450px] overflow-y-auto font-mono text-[11px] leading-relaxed text-foreground/70 whitespace-pre-wrap">
                          {comparedVersionDoc?.body || "Select a historical version to compare"}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </ConsoleCard>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-12 text-center text-xs text-muted-foreground">
                Select a document from the left list to begin editing.
              </div>
            )}
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
