import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ConsolePageGuard } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { FlaskConical, RefreshCw, ShieldCheck, Trash2, UserRoundSearch } from "lucide-react";

const steps = [
  { id: "upload", label: "Upload" },
  { id: "process", label: "Process" },
  { id: "review", label: "Review" },
  { id: "publish", label: "Publish" },
  { id: "watch", label: "Watch" },
  { id: "comment", label: "Comment" },
  { id: "check_numbers", label: "Check numbers" },
] as const;

type Lab = {
  active: boolean;
  channelId?: string;
  hidden?: boolean;
  testOnly?: boolean;
  testWalletMinor?: number;
  currency?: string;
  steps?: Array<{ id: string; status: string }>;
};

export const Route = createFileRoute("/zillionaire/test-lab")({
  component: RoutePage,
  head: () => ({
    meta: [
      { title: "Test Lab | BQ SQWAD TV" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

function RoutePage() {
  return (
    <ConsolePageGuard role="zillionaire" module="video">
      {({ token, account, onLock }) => (
        <ConsoleShell
          consoleType="zillionaire"
          title="Test Lab"
          subtitle="Safely verify test-only workflows without touching real payments."
          activePath="/zillionaire/test-lab"
          account={{
            ...(account.email ? { email: account.email } : {}),
            isOwner: account.isOwner,
            modules: account.modules,
          }}
          {...(onLock ? { onLock } : {})}
        >
          <LabPanel token={token} />
        </ConsoleShell>
      )}
    </ConsolePageGuard>
  );
}

function LabPanel({ token }: { token: string }) {
  const [lab, setLab] = useState<Lab>({ active: false });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/public/v1/zillionaire/test-lab", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "Could not load the test lab.");
      setLab(d);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the test lab.");
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/public/v1/zillionaire/test-lab", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ...payload,
          reason: reason.trim() || "Owner test-lab operation",
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message || "The test-lab action failed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The test-lab action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <ConsoleWelcomeBanner
        title="A separate space for safe checks"
        subtitle="Test-only records are hidden from public discovery and excluded from real wallet and revenue records."
      />
      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <ConsoleCard title="Test session">
          <div className="space-y-5 p-5">
            <div className="flex items-center gap-3">
              <FlaskConical className="h-8 w-8 text-cyan-400" />
              <div>
                <p className="font-semibold text-white">
                  {lab.active ? "Test lab active" : "No active test lab"}
                </p>
                <p className="text-sm text-slate-400">
                  {lab.active
                    ? `Private channel ${lab.channelId}`
                    : "Create a private, unpublished test channel."}
                </p>
              </div>
              <div className="ml-auto">
                <ConsoleStatusBadge status={lab.active ? "active" : "inactive"} />
              </div>
            </div>
            {lab.active ? (
              <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 p-4 text-sm text-amber-100">
                <p className="font-semibold">Test-only wallet display</p>
                <p className="mt-1">
                  {lab.currency || "NGN"} {((lab.testWalletMinor || 0) / 100).toFixed(2)} virtual balance.
                  It is not connected to payment or viewer billing.
                </p>
                <p className="mt-2 text-amber-200/80">
                  This wallet is a sandbox balance only; it cannot fund real playback sessions.
                </p>
              </div>
            ) : null}
            <label className="block text-sm text-slate-300">
              Reason for this action
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                placeholder="e.g. Verify the owner checklist"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {!lab.active ? (
                <button
                  disabled={busy}
                  onClick={() => void act({ action: "CREATE" })}
                  className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                >
                  Create test channel
                </button>
              ) : (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void act({ action: "IMPERSONATE_PREVIEW" })}
                    className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200"
                  >
                    <UserRoundSearch className="h-4 w-4" />
                    Read-only preview record
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(
                          "Remove the unpublished test-only channel and its test records?",
                        )
                      ) {
                        void act({ action: "CLEANUP", confirmation: true });
                      }
                    }}
                    className="flex items-center gap-2 rounded-lg border border-rose-800 px-3 py-2 text-sm text-rose-200"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clean up test data
                  </button>
                </>
              )}
            </div>
            {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
          </div>
        </ConsoleCard>
        <ConsoleCard title="Seven-step verification guide">
          <div className="divide-y divide-slate-800 p-5">
            {steps.map((step, index) => {
              const current =
                lab.steps?.find((s) => s.id === step.id)?.status || "pending";
              return (
                <div key={step.id} className="flex items-center gap-3 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-800 text-xs text-slate-300">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-white">{step.label}</p>
                    <p className="text-xs text-slate-400">
                      {current === "complete"
                        ? "Marked complete"
                        : current === "blocked"
                          ? "Blocked"
                          : "Not started"}
                    </p>
                  </div>
                  <select
                    disabled={!lab.active || busy}
                    value={current}
                    onChange={(e) =>
                      void act({
                        action: "SET_STEP",
                        step: step.id,
                        status: e.target.value,
                      })
                    }
                    className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white"
                  >
                    <option value="pending">Pending</option>
                    <option value="complete">Complete</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              );
            })}
          </div>
        </ConsoleCard>
      </div>
      <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100">
        <ShieldCheck className="mr-2 inline h-4 w-4" />
        The checklist tracks owner verification only. Test media upload, fake-balance playback charging and measured end-to-end results are not connected yet; the interface will not report those steps as automatically verified.
        <button
          onClick={() => void load()}
          className="ml-3 inline-flex items-center gap-1 text-cyan-300"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
    </div>
  );
}
