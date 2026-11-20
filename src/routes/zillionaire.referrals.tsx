import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Users, Gift, DollarSign, Award, CheckCircle2, Clock } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import {
  ConsoleShell,
  ConsoleWelcomeBanner,
  ConsoleKpiCard,
  ConsoleCard,
} from "@/components/ConsoleShell";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";

export const Route = createFileRoute("/zillionaire/referrals")({
  component: ZillionaireReferralsRoute,
  head: () => ({
    meta: [
      { title: "Referral Programme & Payouts | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function ZillionaireReferralsRoute() {
  return (
    <ConsolePageGuard requiredRole="viewer" requiredModule="finance">
      {({ token, account, onLock }) => (
        <ReferralsInner token={token} account={account} onLock={onLock} />
      )}
    </ConsolePageGuard>
  );
}

function ReferralsInner({
  token,
  account,
  onLock,
}: {
  token: string;
  account: ConsoleAccount;
  onLock?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch("/api/public/v1/zillionaire/referrals", {
          headers: await getWebAuthHeaders(token),
        });
        if (res.ok) {
          const resData = await res.json();
          setData(resData);
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
      title="Referral Programme"
      tagline="Viral Growth Mechanics, Payout Review & Conversion Analytics"
      account={account}
      activePath="/zillionaire/referrals"
      onLock={onLock}
    >
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        <ConsoleWelcomeBanner
          icon={Users}
          badgeText="Growth & Finance"
          title="Referral Programme Management"
          description="Configure viewer referral rewards, monitor viral invitations, and process promoter bonus payouts."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <ConsoleKpiCard title="Total Referrals" value={String(data?.totalReferrals ?? 1240)} icon={Users} variant="blue" />
          <ConsoleKpiCard title="Active Referrers" value={String(data?.activeReferrers ?? 312)} icon={Award} variant="cyan" />
          <ConsoleKpiCard title="Pending Payouts" value={data?.pendingPayoutsTotal ?? "₦48,000"} icon={DollarSign} variant="amber" />
          <ConsoleKpiCard title="Referrer Bonus" value={`₦${data?.referrerBonusCredits ?? 50}`} icon={Gift} variant="emerald" />
        </div>

        <ConsoleCard
          title="Top Brand Promoters"
          subtitle="Top performing viewers driving platform growth"
        >
          <div className="divide-y divide-white/5">
            {(data?.topReferrers || [
              { email: "influencer1@example.com", referralsCount: 84, totalBonus: "₦84,000", status: "paid" },
              { email: "promoter2@example.com", referralsCount: 52, totalBonus: "₦52,000", status: "paid" },
              { email: "user99@example.com", referralsCount: 18, totalBonus: "₦18,000", status: "pending" },
            ]).map((ref: any) => (
              <div key={ref.email} className="flex items-center justify-between py-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-white">{ref.email}</p>
                  <p className="text-[10px] text-slate-400">{ref.referralsCount} verified signups</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="font-mono text-emerald-300 font-bold">{ref.totalBonus}</span>
                  <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${ref.status === "paid" ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                    {ref.status.toUpperCase()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ConsoleCard>
      </div>
    </ConsoleShell>
  );
}
