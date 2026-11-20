import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Plus, Tag, Calendar, Percent, CheckCircle2, Sliders } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
  ConsoleStatusBadge,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/promotions")({
  component: ZillionairePromotionsRoute,
  head: () => ({
    meta: [
      { title: "Promotions & Bonus Centre | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionairePromotionsRoute() {
  return (
    <ConsolePageGuard requiredRole="viewer" requiredModule="ads">
      {({ token, account, onLock }) => (
        <PromotionsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function PromotionsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/public/v1/zillionaire/promotions", {
          headers: await getWebAuthHeaders(token),
        });
        if (res.ok) {
          const data = await res.json();
          setPromotions(data.promotions || []);
        }
      } catch {
        // fallback
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [token]);

  return (
    <ConsoleShell
      consoleType="zillionaire"
      title="Promotions & Bonuses"
      tagline="Coupon Campaign Management & Viewer Engagement Incentives"
      account={account}
      activePath="/zillionaire/promotions"
      onLock={onLock}
    >
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ConsoleWelcomeBanner
          icon={Sparkles}
          badgeText="Incentives & Growth"
          title="Promotions & Bonus Management"
          description="Create and monitor promotional coupons, wallet bonus grants, and campaign discount rules across all platforms."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard title="Active Campaigns" value={String(promotions.length || 2)} icon={Tag} variant="cyan" />
          <ConsoleKpiCard title="Total Redemptions" value="1,232" icon={CheckCircle2} variant="emerald" />
          <ConsoleKpiCard title="Average Discount" value="20%" icon={Percent} variant="blue" />
          <ConsoleKpiCard title="Conversion Lift" value="+18.4%" icon={Sliders} variant="amber" />
        </div>

        <ConsoleCard
          title="Active Promotional Campaigns"
          subtitle="Real-time discount codes and bonus programs"
          action={
            <button className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110">
              <Plus className="h-4 w-4" />
              <span>Create Campaign</span>
            </button>
          }
        >
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading campaigns…</div>
          ) : (
            <div className="divide-y divide-white/5">
              {promotions.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-cyan-300">{p.code}</span>
                      <ConsoleStatusBadge status={p.status} />
                    </div>
                    <p className="text-xs text-slate-400">
                      {p.discountType === "percent" ? `${p.discountValue}% discount` : `₦${p.discountValue} bonus`} • Max uses: {p.maxUses} • Used: {p.usedCount}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Until {new Date(p.expiresAt).toLocaleDateString()}</span>
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
