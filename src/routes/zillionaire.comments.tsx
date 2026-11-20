import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, ShieldCheck, CheckCircle2, EyeOff, Trash2, Filter } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/comments")({
  component: ZillionaireCommentsRoute,
  head: () => ({
    meta: [
      { title: "Comments & Ratings Moderation | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireCommentsRoute() {
  return (
    <ConsolePageGuard requiredRole="viewer" requiredModule="moderation">
      {({ token, account, onLock }) => (
        <CommentsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function CommentsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/public/v1/zillionaire/comments", {
          headers: await getWebAuthHeaders(token),
        });
        if (res.ok) {
          const data = await res.json();
          setComments(data.comments || []);
        }
      } catch {
        // quiet fallback
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [token]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Comments & Ratings"
      tagline="Viewer Reviews Moderation & Community Guidelines Enforcement"
      account={account}
      activePath="/zillionaire/comments"
      onLock={onLock}
    >
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ConsoleWelcomeBanner
          icon={MessageSquare}
          badgeText="Trust & Safety"
          title="Comments & Ratings Moderation"
          description="Review user feedback, moderate reported comments, manage abusive ratings, and configure per-title comment toggles."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard title="Total Comments" value="4,821" icon={MessageSquare} variant="blue" />
          <ConsoleKpiCard title="Pending Review" value="1" icon={Filter} variant="amber" />
          <ConsoleKpiCard title="Approved" value="4,790" icon={CheckCircle2} variant="emerald" />
          <ConsoleKpiCard title="Hidden / Blocked" value="30" icon={EyeOff} variant="rose" />
        </div>

        <ConsoleCard
          title="Viewer Comments Stream"
          subtitle="Recent viewer reviews and community submissions across titles"
        >
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading comments stream…</div>
          ) : (
            <div className="divide-y divide-white/5">
              {comments.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="space-y-1 max-w-xl">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-cyan-300">{c.contentTitle}</span>
                      <span className="text-[10px] text-slate-400">• {c.authorEmail}</span>
                      {c.flagged && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                          FLAGGED
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-200">{c.text}</p>
                    <p className="text-[10px] text-slate-400">Rating: {"★".repeat(c.rating || 5)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20">
                      Approve
                    </button>
                    <button className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/20">
                      Hide
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ConsoleCard>
      </div>
    </ConsoleShell>
  );
}
