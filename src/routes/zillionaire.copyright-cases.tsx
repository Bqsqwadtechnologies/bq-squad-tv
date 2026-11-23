import { useEffect, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Scale, CheckCircle2, XCircle, AlertTriangle, ShieldAlert, FileText, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/zillionaire/copyright-cases")({
  component: CopyrightCasesRoute,
  head: () => ({
    meta: [
      { title: "Copyright Cases | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface CopyrightCase {
  id: string;
  caseId: string;
  targetId: string;
  targetType: string;
  targetTitle?: string;
  producerUid?: string;
  producerName?: string;
  copyrightStrikes?: number;
  reporterName: string;
  reporterEmail: string;
  workClaimed: string;
  proofLinkOrPath?: string;
  status: "under_review" | "takedown" | "dismissed" | "restored" | "counter_notice_open";
  counterNoticeReceived?: boolean;
  strikeIssued?: boolean;
  notes?: string;
  createdAt: string;
}

function CopyrightCasesRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="moderation">
      {({ account }) => <CopyrightCasesContent account={account} />}
    </ConsolePageGuard>
  );
}

function CopyrightCasesContent({ account }: { account: ConsoleAccount }) {
  const [cases, setCases] = useState<CopyrightCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Decision Modal State
  const [activeCase, setActiveCase] = useState<CopyrightCase | null>(null);
  const [decisionAction, setDecisionAction] = useState<"remove" | "keep" | "restore" | null>(null);
  const [decisionNotes, setDecisionNotes] = useState("");
  const [decisionSubmitting, setDecisionSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  async function fetchCases() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/copyright-cases/");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.cases) ? data.cases : [];
        setCases(list);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "Failed to load copyright cases");
      }
    } catch {
      setError("Network error loading copyright cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCases();
  }, []);

  function openDecisionModal(item: CopyrightCase, action: "remove" | "keep" | "restore") {
    setActiveCase(item);
    setDecisionAction(action);
    setDecisionNotes("");
    setDecisionError(null);
  }

  async function handleConfirmDecision() {
    if (!activeCase || !decisionAction) return;
    if (decisionNotes.trim().length < 3) {
      setDecisionError("Please provide audit notes explaining this copyright decision (at least 3 characters).");
      return;
    }

    setDecisionSubmitting(true);
    setDecisionError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/copyright-cases/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caseId: activeCase.caseId || activeCase.id,
          action: decisionAction,
          decisionNotes: decisionNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Decision failed to record");
      }
      setActiveCase(null);
      setDecisionAction(null);
      await fetchCases();
    } catch (err: unknown) {
      setDecisionError(err instanceof Error ? err.message : "Error executing copyright decision");
    } finally {
      setDecisionSubmitting(false);
    }
  }

  const columns: EntityColumn<CopyrightCase>[] = [
    { key: "id", header: "Case ID", render: (c) => <span className="font-mono font-bold text-primary">{c.caseId || c.id}</span> },
    { key: "targetId", header: "Target Asset", render: (c) => <span className="font-semibold text-foreground">{c.targetTitle || c.targetId}</span> },
    { key: "reporter", header: "Claimant", render: (c) => <span className="text-muted-foreground">{c.reporterName} ({c.reporterEmail})</span> },
    { key: "work", header: "Work Claimed", render: (c) => <span className="truncate max-w-[200px] text-muted-foreground">{c.workClaimed}</span> },
    {
      key: "status",
      header: "Status",
      render: (c) => (
        <ConsoleStatusBadge
          status={c.status === "takedown" ? "inactive" : c.status === "under_review" ? "pending" : "active"}
          label={c.status.replace(/_/g, " ")}
        />
      ),
    },
    { key: "date", header: "Filed", render: (c) => <span className="text-muted-foreground">{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "Recent"}</span> },
  ];

  const actions: EntityAction<CopyrightCase>[] = [
    {
      label: "Enforce Takedown",
      variant: "destructive",
      icon: XCircle,
      requiresNotes: false,
      onClick: (item) => openDecisionModal(item, "remove"),
    },
    {
      label: "Dismiss Claim",
      variant: "success",
      icon: CheckCircle2,
      requiresNotes: false,
      onClick: (item) => openDecisionModal(item, "keep"),
    },
    {
      label: "Restore (Counter-Notice)",
      variant: "outline",
      icon: Scale,
      requiresNotes: false,
      onClick: (item) => openDecisionModal(item, "restore"),
    },
  ];

  const kpis = useMemo(() => [
    { title: "Total Cases", value: cases.length, tone: "cyan" as const },
    { title: "Under Review", value: cases.filter((c) => c.status === "under_review").length, tone: "amber" as const },
    { title: "Enforced Takedowns", value: cases.filter((c) => c.status === "takedown").length, tone: "rose" as const },
  ], [cases]);

  return (
    <>
      <ZillionaireEntityConsole
        account={account}
        title="DMCA & Copyright Dispute Management"
        subtitle="Review statutory DMCA takedown requests, examine evidence, and record enforceable decisions with full audit trails."
        icon={Scale}
        items={cases}
        columns={columns}
        idKey="id"
        searchFields={["caseId", "targetId", "targetTitle", "reporterName", "reporterEmail", "workClaimed"]}
        kpis={kpis}
        tabs={[
          { id: "all", label: "All Cases", filter: () => true },
          { id: "pending", label: "Under Review", filter: (c) => c.status === "under_review" },
          { id: "takedown", label: "Takedowns Enforced", filter: (c) => c.status === "takedown" },
          { id: "dismissed", label: "Dismissed", filter: (c) => c.status === "dismissed" },
        ]}
        actions={actions}
        detailFields={[
          { label: "Target Title & ID", render: (c) => `${c.targetTitle || "Video"} (${c.targetId})` },
          { label: "Claimant Details", render: (c) => `${c.reporterName} • ${c.reporterEmail}` },
          { label: "Work Claimed Infringed", render: (c) => c.workClaimed },
          { label: "Producer Strikes", render: (c) => `${c.copyrightStrikes ?? 0} active copyright strikes on record` },
          { label: "Resolution Notes", render: (c) => c.notes || "Pending formal review" },
        ]}
      />

      {/* Accessible Decision Modal */}
      <Dialog open={Boolean(activeCase && decisionAction)} onOpenChange={(open) => !open && setActiveCase(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {decisionAction === "remove" && <XCircle className="w-5 h-5 text-rose-500" />}
              {decisionAction === "keep" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {decisionAction === "restore" && <Scale className="w-5 h-5 text-cyan-500" />}
              Confirm Copyright Decision:{" "}
              {decisionAction === "remove" ? "Enforce Takedown" : decisionAction === "keep" ? "Dismiss Claim" : "Restore Content"}
            </DialogTitle>
            <DialogDescription>
              {activeCase && (
                <span>
                  Case <strong>{activeCase.caseId || activeCase.id}</strong> targeting <strong>{activeCase.targetTitle || activeCase.targetId}</strong>.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {decisionAction === "remove" && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-md text-xs text-rose-300">
                Warning: Enforcing takedown will immediately remove the asset from public catalogues, unpublish active streams, and apply a copyright strike to the producer.
              </div>
            )}

            <div>
              <label htmlFor="decision-notes" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block mb-1">
                Audit Decision Notes (Required)
              </label>
              <textarea
                id="decision-notes"
                className="w-full bg-background border border-border rounded-md p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary h-24 resize-none"
                placeholder="State the statutory basis, investigation findings, or evidence considered..."
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
              />
            </div>

            {decisionError && (
              <p className="text-xs text-rose-400 font-medium">{decisionError}</p>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={decisionSubmitting}
              onClick={() => setActiveCase(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={decisionAction === "remove" ? "destructive" : "default"}
              disabled={decisionSubmitting || decisionNotes.trim().length < 3}
              onClick={handleConfirmDecision}
            >
              {decisionSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
