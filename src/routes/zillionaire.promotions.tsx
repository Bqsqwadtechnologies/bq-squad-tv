import { FormDiscardButton } from "@/components/FormDiscardButton";
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
        <PromotionsInner token={token} account={account} {...(onLock ? { onLock } : {})} />
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
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed_credits">("percent");
  const [discountValue, setDiscountValue] = useState<number>(20);
  const [maxUses, setMaxUses] = useState<number>(1000);
  const [expiresAt, setExpiresAt] = useState("2026-12-31T23:59:59Z");

  function resetForm() {
    setCode("");
    setDiscountType("percent");
    setDiscountValue(20);
    setMaxUses(1000);
    setExpiresAt("2026-12-31T23:59:59Z");
    setFormError(null);
    setModalOpen(false);
  }

  async function handleCreatePromotion(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/v1/zillionaire/promotions/", {
        method: "POST",
        headers: {
          ...(await getWebAuthHeaders(token)),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          discountType,
          discountValue: Number(discountValue),
          startsAt: new Date().toISOString(),
          expiresAt: new Date(expiresAt).toISOString(),
          maxUses: Number(maxUses),
          featuredPlacement: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to create promotion");
      }
      if (data.promotion) {
        setPromotions((prev) => [data.promotion, ...prev]);
      }
      resetForm();
    } catch (err: any) {
      setFormError(err.message || "Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  }

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

        {(() => {
          const totalRedemptions = promotions.reduce((acc, p) => acc + (typeof p.redemptionsCount === "number" ? p.redemptionsCount : 0), 0);
          const avgDiscount = promotions.length > 0 ? `${Math.round(promotions.reduce((acc, p) => acc + (typeof p.discountPercent === "number" ? p.discountPercent : 0), 0) / promotions.length)}%` : "0%";
          const activeRules = promotions.filter((p) => p.active !== false).length;
          return (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <ConsoleKpiCard title="Active Campaigns" value={String(promotions.length)} icon={Tag} variant="blue" caption="Configured promotions" />
              <ConsoleKpiCard title="Total Redemptions" value={String(totalRedemptions)} icon={CheckCircle2} variant="green" caption="Successful redemptions" />
              <ConsoleKpiCard title="Average Discount" value={avgDiscount} icon={Percent} variant="blue" caption="Discount average" />
              <ConsoleKpiCard title="Campaign Rules" value={String(activeRules)} icon={Sliders} variant="gold" caption="Active rule sets" />
            </div>
          );
        })()}

        <ConsoleCard
          title="Active Promotional Campaigns"
          subtitle="Real-time discount codes and bonus programs"
          action={
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-[#030e28] hover:brightness-110"
            >
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

        {/* Create Campaign Modal */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
            <div className="max-w-md w-full rounded-3xl border border-white/10 bg-[#07143D] p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles size={18} className="text-cyan-400" />
                  <span>New Promotional Campaign</span>
                </h3>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg p-1 text-slate-400 hover:text-white hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              {formError && (
                <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  {formError}
                </div>
              )}

              <form onSubmit={handleCreatePromotion} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Campaign Code *</label>
                  <input
                    type="text"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SUMMER2026"
                    className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white font-mono uppercase focus:border-cyan-400 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Discount Type *</label>
                    <select
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as any)}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="percent">Percentage (%)</option>
                      <option value="fixed_credits">Fixed Credits</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {discountType === "percent" ? "Discount Value (%)" : "Credits Value"} *
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={discountType === "percent" ? 100 : 100000}
                      value={discountValue}
                      onChange={(e) => setDiscountValue(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Maximum Uses *</label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={1000000}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Number(e.target.value))}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Expires At *</label>
                    <input
                      type="date"
                      required
                      value={expiresAt.slice(0, 10)}
                      onChange={(e) => setExpiresAt(e.target.value + "T23:59:59Z")}
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                  <FormDiscardButton onDiscard={resetForm} label="Discard" />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-cyan-400 px-4 py-2 font-bold text-[#030e28] hover:brightness-110 disabled:opacity-50"
                  >
                    {submitting ? "Creating…" : "Save Campaign"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
