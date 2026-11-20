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
  component: PagesRoute,
  head: () => ({
    meta: [
      { title: "Legal Pages & Policy Publisher | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

type LegalPageDoc = {
  slug: string;
  title: string;
  body: string;
  audience: "public" | "producer" | "provider";
  status: "published" | "draft" | "scheduled";
  version: number;
  effectiveAt: string | null;
  scheduledPublishAt: string | null;
  requiresReacceptance: boolean;
  versions: Array<{
    version: number;
    title: string;
    body: string;
    status: string;
    effectiveAt?: string | null;
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
  { key: "company_name", label: "Company Name", defaultVal: "BQ Sqwad Technologies" },
  { key: "platform_name", label: "Platform Name", defaultVal: "BQ SQWAD TV" },
  { key: "contact_email", label: "Contact Email", defaultVal: "tv@bqsqwad.com" },
  { key: "support_email", label: "Support Email", defaultVal: "tv@bqsqwad.com" },
  { key: "legal_email", label: "Legal Email", defaultVal: "tv@bqsqwad.com" },
  { key: "governing_country", label: "Governing Country", defaultVal: "Nigeria" },
  { key: "effective_date", label: "Effective Date", defaultVal: "January 1, 2026" },
  { key: "minimum_age", label: "Minimum Age", defaultVal: "13" },
];

function PagesRoute() {
  return (
    <ConsolePageGuard
      module="system"
      title="Legal Pages Publisher"
      description="Manage, draft, schedule and publish official legal documents and user policies."
    >
      {({ token, account }) => <PagesDashboard token={token} account={account} />}
    </ConsolePageGuard>
  );
}

function PagesDashboard({ token, account }: { token: string; account: ConsoleAccount }) {
  const [pages, setPages] = useState<LegalPageDoc[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("privacy-policy");
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editor states
  const [editorTab, setEditorTab] = useState<"edit" | "preview" | "history" | "compare">("edit");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"public" | "producer" | "provider">("public");
  const [changeSummary, setChangeSummary] = useState("");
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [requiresReacceptance, setRequiresReacceptance] = useState(false);
  const [selectedHistoryVersion, setSelectedHistoryVersion] = useState<number | null>(null);

  // Step-up publish state
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublishingDefaults, setIsPublishingDefaults] = useState(false);

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
      if (!res.ok) throw new Error(data.error || "Failed to load legal pages.");
      setPages(data.pages || []);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to load pages.");
    } finally {
      setLoading(false);
    }
  }, [account.token]);

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
      setScheduledPublishAt(activePage.scheduledPublishAt || "");
      setRequiresReacceptance(activePage.requiresReacceptance);
      if (activePage.versions.length > 0) {
        setSelectedHistoryVersion(activePage.versions[activePage.versions.length - 1]?.version ?? null);
      } else {
        setSelectedHistoryVersion(null);
      }
    }
  }, [activePage]);

  // Insert placeholder at cursor or append
  const insertPlaceholder = (key: string) => {
    const placeholder = `{{${key}}}`;
    setBody((prev) => prev + " " + placeholder);
  };

  // Save Draft
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
          changeSummary: changeSummary.trim() || "Saved updated draft content",
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          requiresReacceptance,
          reason: "Owner updated legal page draft via Pages Manager",
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
      // First save draft content
      await fetch("/api/public/v1/zillionaire/pages/", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          title,
          body,
          audience,
          changeSummary: changeSummary.trim() || "Pre-publish update",
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          requiresReacceptance,
          reason: "Owner updated draft prior to publication",
        }),
      });

      // Call publish endpoint
      const nowIso = new Date().toISOString();
      const res = await fetch("/api/public/v1/zillionaire/pages/publish", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: activePage.slug,
          effectiveAt: nowIso,
          scheduledPublishAt: scheduledPublishAt ? new Date(scheduledPublishAt).toISOString() : null,
          changeSummary: changeSummary.trim() || "Published updated document version",
          reason: "Owner published legal document via Pages Console",
          requiresReacceptance,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish page.");
      setStatusMessage(
        data.scheduled
          ? `Page scheduled to publish on ${new Date(scheduledPublishAt).toLocaleString()}`
          : `Page published live as Version ${data.version}! ${data.warning || ""}`
      );
      await loadPages();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Publication failed.");
    } finally {
      setIsPublishing(false);
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
          reason: "Owner published all standard defaults in one tap",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to publish defaults.");
      setStatusMessage(
        `All ${data.pages?.length || 12} default legal pages published live! ${data.warning || ""}`
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
          reason: `Restored previous Version ${versionNumber} via Pages Console`,
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
          title="Legal Pages Editor & Publisher"
          description="Edit, preview, compare, schedule, and publish official compliance documents with version control and single-tap default rollout."
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

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-xs leading-5 text-amber-100">
          <strong>Legal review reminder:</strong> Default copy is a starting point, not legal advice. Review every published policy with qualified counsel; the notice is visible only in this owner console.
        </div>

        {errorMessage && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm font-medium text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Top KPIs */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard
            title="Total Legal Documents"
            value={pages.length.toString()}
            subtitle="Covering audience & compliance policies"
            icon={<FileText className="h-5 w-5 text-primary" />}
          />
          <ConsoleKpiCard
            title="Published Live"
            value={pages.filter((p) => p.status === "published").length.toString()}
            subtitle="Accessible on public /legal/:slug"
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
            subtitle="Safely isolated, never blocks users"
            icon={<Edit3 className="h-5 w-5 text-sky-400" />}
          />
        </div>

        {/* Main 2-column layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Document Navigator */}
          <div className="lg:col-span-4 space-y-4">
            <ConsoleCard
              title="Legal Documents"
              subtitle="Select a policy or terms document to edit"
            >
              <div className="space-y-1.5 pt-2">
                {pages.map((p) => {
                  const isSelected = p.slug === selectedSlug;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => setSelectedSlug(p.slug)}
                      className={`flex w-full items-center justify-between rounded-xl px-3.5 py-3 text-left transition ${
                        isSelected
                          ? "bg-primary/10 border border-primary/30 text-primary font-bold shadow-sm"
                          : "hover:bg-muted text-foreground border border-transparent"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <div className="truncate text-xs font-semibold">{p.title}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span className="font-mono">{p.slug}</span>
                          <span>·</span>
                          <span className="capitalize">{p.audience}</span>
                          <span>·</span>
                          <span>v{p.version}</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
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
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </ConsoleCard>
          </div>

          {/* Right Column: Editor & Workflow Workspace */}
          <div className="lg:col-span-8 space-y-4">
            {activePage ? (
              <ConsoleCard
                title={activePage.title}
                subtitle={`Public route: /legal/${activePage.slug}`}
                actions={
                  <div className="flex items-center gap-2">
                    <a
                      href={`/legal/${activePage.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      View Public
                    </a>
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
                        ? "Schedule"
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
                    Markdown Editor
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

                {/* Tab Content */}
                {editorTab === "edit" && (
                  <div className="space-y-4">
                    {/* Metadata Row */}
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

                    {/* Publishing & Scheduling Controls */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-border bg-card p-4">
                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          Schedule Publishing (Optional)
                        </label>
                        <input
                          type="datetime-local"
                          value={scheduledPublishAt ? scheduledPublishAt.slice(0, 16) : ""}
                          onChange={(e) => setScheduledPublishAt(e.target.value ? new Date(e.target.value).toISOString() : "")}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Leave empty to publish immediately on command.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-foreground mb-1.5">
                          Change Summary & Audit Note
                        </label>
                        <input
                          type="text"
                          value={changeSummary}
                          onChange={(e) => setChangeSummary(e.target.value)}
                          placeholder="e.g. Updated dispute clause for 2026"
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                        <div className="mt-2.5 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="reacceptance"
                            checked={requiresReacceptance}
                            onChange={(e) => setRequiresReacceptance(e.target.checked)}
                            className="rounded border-border text-primary focus:ring-primary"
                          />
                          <label htmlFor="reacceptance" className="text-[11px] text-foreground">
                            Require user re-acceptance on next sign-in
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {editorTab === "preview" && (
                  <div className="rounded-xl border border-border bg-card p-6 min-h-[400px]">
                    <div className="border-b border-border pb-4 mb-6">
                      <h1 className="text-2xl font-black">{title}</h1>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Version {activePage.version || 1}</span>
                        <span>·</span>
                        <span>Audience: {audience}</span>
                        <span>·</span>
                        <span>Effective: {new Date().toLocaleDateString()}</span>
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
