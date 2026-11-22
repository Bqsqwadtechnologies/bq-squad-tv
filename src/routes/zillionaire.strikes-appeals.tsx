import { useEffect, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, AlertTriangle, CheckCircle2, RotateCcw, XCircle, Loader2 } from "lucide-react";
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

export const Route = createFileRoute("/zillionaire/strikes-appeals")({
  component: StrikesAppealsRoute,
  head: () => ({
    meta: [
      { title: "Strikes & Appeals Centre | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

interface StrikeRecord {
  id: string;
  strikeId: string;
  accountUid: string;
  accountRole: "producer" | "provider" | "viewer";
  accountEmail: string;
  strikeCount: number;
  strikeType: "copyright" | "community_guidelines" | "kyc_fraud";
  reason: string;
  penaltiesActive: string;
  appealStatus: "none" | "submitted" | "approved" | "rejected" | "dismissed";
  appealNotes?: string;
  issuedAt: string;
  expiresAt: string;
}

function StrikesAppealsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="security">
      {(account) => <StrikesAppealsContent account={account} />}
    </ConsolePageGuard>
  );
}

function StrikesAppealsContent({ account }: { account: ConsoleAccount }) {
  const [items, setItems] = useState<StrikeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Appeal Action Modal State
  const [activeStrike, setActiveStrike] = useState<StrikeRecord | null>(null);
  const [appealAction, setAppealAction] = useState<"grant_appeal" | "reject_appeal" | "dismiss_strike" | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  async function fetchStrikes() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/strikes/");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.strikes) ? data.strikes : [];
        setItems(list);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "Failed to load account strikes");
      }
    } catch {
      setError("Network error fetching strikes data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStrikes();
  }, []);

  function openActionModal(strike: StrikeRecord, action: "grant_appeal" | "reject_appeal" | "dismiss_strike") {
    setActiveStrike(strike);
    setAppealAction(action);
    setActionNotes("");
    setModalError(null);
  }

  async function handleConfirmAction() {
    if (!activeStrike || !appealAction) return;
    if (actionNotes.trim().length < 3) {
      setModalError("Please provide an audit reason for this action (at least 3 characters).");
      return;
    }

    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/strikes/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          strikeId: activeStrike.strikeId || activeStrike.id,
          action: appealAction,
          decisionNotes: actionNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Action execution failed");
      }
      setActiveStrike(null);
      setAppealAction(null);
      await fetchStrikes();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : "Error recording strike action");
    } finally {
      setSubmitting(false);
    }
  }

  const columns: EntityColumn<StrikeRecord>[] = [
    { key: "email", header: "Account", render: (s) => <span className="font-semibold text-foreground">{s.accountEmail}</span> },
    { key: "role", header: "Role", render: (s) => <span className="capitalize text-muted-foreground">{s.accountRole}</span> },
    {
      key: "strikes",
      header: "Strike Count",
      render: (s) => (
        <span className={`font-mono font-bold px-2 py-0.5 rounded ${s.strikeCount >= 3 ? "bg-rose-500/20 text-rose-300" : s.strikeCount === 2 ? "bg-amber-500/20 text-amber-300" : "bg-cyan-500/20 text-cyan-300"}`}>
          Strike {s.strikeCount} / 3
        </span>
      ),
    },
    { key: "type", header: "Violation Type", render: (s) => <span className="capitalize text-muted-foreground">{s.strikeType.replace(/_/g, " ")}</span> },
    { key: "appeal", header: "Appeal Status", render: (s) => <ConsoleStatusBadge status={s.appealStatus === "submitted" ? "pending" : s.appealStatus === "approved" ? "active" : "inactive"} label={s.appealStatus === "none" ? "No Appeal" : `Appeal: ${s.appealStatus}`} /> },
  ];

  const actions: EntityAction<StrikeRecord>[] = [
    {
      label: "Grant Appeal & Lift Strike",
      variant: "success",
      icon: CheckCircle2,
      requiresNotes: false,
      onClick: (item) => openActionModal(item, "grant_appeal"),
    },
    {
      label: "Reject Appeal",
      variant: "destructive",
      icon: XCircle,
      requiresNotes: false,
      onClick: (item) => openActionModal(item, "reject_appeal"),
    },
    {
      label: "Dismiss Strike",
      variant: "secondary",
      icon: RotateCcw,
      requiresNotes: false,
      onClick: (item) => openActionModal(item, "dismiss_strike"),
    },
  ];

  const kpis = useMemo(() => [
    { title: "Total Active Strikes", value: items.length, tone: "rose" as const },
    { title: "Pending Appeals", value: items.filter((s) => s.appealStatus === "submitted").length, tone: "amber" as const },
    { title: "Termination Level (3 Strikes)", value: items.filter((s) => s.strikeCount >= 3).length, tone: "rose" as const },
  ], [items]);

  return (
    <>
      <ZillionaireEntityConsole
        account={account}
        title="Strike & Appeal Operations Centre"
        subtitle="Manage copyright and community guideline strikes across producers and broadcasters with formal appeal reviews."
        icon={ShieldAlert}
        items={items}
        columns={columns}
        idKey="id"
        searchFields={["accountEmail", "accountUid", "reason"]}
        kpis={kpis}
        tabs={[
          { id: "all", label: "All Strikes", filter: () => true },
          { id: "appeals", label: "Appeals Pending", filter: (s) => s.appealStatus === "submitted" },
          { id: "critical", label: "Critical (>= 3)", filter: (s) => s.strikeCount >= 3 },
        ]}
        actions={actions}
        detailFields={[
          { label: "Account Email & UID", render: (s) => `${s.accountEmail} (${s.accountUid})` },
          { label: "Violation Rationale", render: (s) => s.reason },
          { label: "Active Penalties", render: (s) => s.penaltiesActive },
          { label: "Expiry Date", render: (s) => `Expires on ${s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "Scheduled"} if no further violations occur` },
          { label: "Appeal Notes", render: (s) => s.appealNotes || "No notes submitted" },
        ]}
      />

      {/* Action Dialog Modal */}
      <Dialog open={Boolean(activeStrike && appealAction)} onOpenChange={(open) => !open && setActiveStrike(null)}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {appealAction === "grant_appeal" && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              {appealAction === "reject_appeal" && <XCircle className="w-5 h-5 text-rose-500" />}
              {appealAction === "dismiss_strike" && <RotateCcw className="w-5 h-5 text-cyan-500" />}
              {appealAction === "grant_appeal" ? "Grant Appeal & Reduce Strike" : appealAction === "reject_appeal" ? "Reject Strike Appeal" : "Dismiss Strike"}
            </DialogTitle>
            <DialogDescription>
              {activeStrike && (
                <span>
                  Action on account <strong>{activeStrike.accountEmail}</strong> (Current strikes: {activeStrike.strikeCount}/3).
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <label htmlFor="action-notes" className="text-xs font-semibold uppercase text-muted-foreground tracking-wider block mb-1">
                Audit Reason (Required)
              </label>
              <textarea
                id="action-notes"
                className="w-full bg-background border border-border rounded-md p-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary h-24 resize-none"
                placeholder="State the findings, compliance review, or reasoning..."
                value={actionNotes}
                onChange={(e) => setActionNotes(e.target.value)}
              />
            </div>

            {modalError && (
              <p className="text-xs text-rose-400 font-medium">{modalError}</p>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              onClick={() => setActiveStrike(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={appealAction === "reject_appeal" ? "destructive" : "default"}
              disabled={submitting || actionNotes.trim().length < 3}
              onClick={handleConfirmAction}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null}
              Confirm Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
