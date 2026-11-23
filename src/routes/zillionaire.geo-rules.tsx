import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Globe2, Shield, Check, X, AlertCircle, Edit3, Settings } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { getWebAuthHeaders } from "@/lib/firebase-web-auth";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";
import {
  getAllCountryRules,
  getCountryRule,
  type KycCountryRule,
} from "@/lib/kyc-country-rules";

export const Route = createFileRoute("/zillionaire/geo-rules")({
  component: GeoRulesRoute,
  head: () => ({
    meta: [{ title: "Geographic Rules | Zillionaire Control Centre" }],
  }),
});

interface GeoRule {
  id: string;
  targetId: string;
  targetTitle: string;
  targetType: "movie" | "series" | "channel" | "live_stream";
  mode: "allow_only" | "block_only" | "worldwide";
  countries: string[];
  reason: string;
  updatedAt: string;
}

const mockGeoRules: GeoRule[] = [
  {
    id: "geo_01",
    targetId: "mov_lagos_nights",
    targetTitle: "Lagos Nights: Underground",
    targetType: "movie",
    mode: "worldwide",
    countries: [],
    reason: "Worldwide digital distribution license secured.",
    updatedAt: "2026-03-20",
  },
  {
    id: "geo_02",
    targetId: "chan_afrobeats_tv",
    targetTitle: "Afrobeats 24/7 Live TV",
    targetType: "channel",
    mode: "allow_only",
    countries: ["NG", "GH", "KE", "ZA", "GB", "US"],
    reason: "Broadcast license territorially restricted to Pan-Africa, UK, and US.",
    updatedAt: "2026-03-22",
  },
  {
    id: "geo_03",
    targetId: "mov_nollywood_drama",
    targetTitle: "Heart of Abuja",
    targetType: "movie",
    mode: "block_only",
    countries: ["FR"],
    reason: "Theatrical holdback window in France.",
    updatedAt: "2026-03-15",
  },
];

function GeoRulesRoute() {
  return (
    <ConsolePageGuard role="owner">
      {({ account, token }) => <GeoRulesContent account={account} token={token} />}
    </ConsolePageGuard>
  );
}

function GeoRulesContent({ account, token }: { account: ConsoleAccount; token: string }) {
  const [activeTab, setActiveTab] = useState<"geo" | "kyc">("kyc");
  const [geoRules, setGeoRules] = useState<GeoRule[]>([]);
  const [kycRules, setKycRules] = useState<KycCountryRule[]>(() => getAllCountryRules());
  const [customOverrides, setCustomOverrides] = useState<Record<string, any>>({});
  const [loadingKyc, setLoadingKyc] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function loadCountryRules() {
      try {
        setLoadingKyc(true);
        const res = await fetch("/api/public/v1/zillionaire/kyc/country-rules", { headers: await getWebAuthHeaders(token) });
        if (res.ok) {
          const data = await res.json();
          if (data.rules && Array.isArray(data.rules)) {
            setKycRules(data.rules);
            setCustomOverrides(data.customOverrides || {});
          }
        }
      } catch {
        // Fallback to client-side baseline
      } finally {
        setLoadingKyc(false);
      }
    }
    loadCountryRules();
  }, [token]);

  async function handleUpdateKycRule(rule: KycCountryRule, reason?: string) {
    if (!reason || reason.trim().length < 3) {
      setNotice({ type: "error", text: "A mandatory reason of at least 3 characters is required to modify KYC rules." });
      return;
    }

    try {
      const res = await fetch("/api/public/v1/zillionaire/kyc/country-rules", {
        method: "POST",
        headers: { ...(await getWebAuthHeaders(token)), "Content-Type": "application/json" },
        body: JSON.stringify({
          countryCode: rule.code,
          ruleUpdate: {
            isCustomized: true,
            notes: reason,
          },
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setNotice({ type: "error", text: err.message || "Failed to update country rule." });
        return;
      }

      setNotice({ type: "success", text: `KYC rule updated for ${rule.name}.` });
      // Reload
      const updatedRes = await fetch("/api/public/v1/zillionaire/kyc/country-rules", { headers: await getWebAuthHeaders(token) });
      if (updatedRes.ok) {
        const data = await updatedRes.json();
        setKycRules(data.rules);
      }
    } catch (err: any) {
      setNotice({ type: "error", text: err.message || "Error updating country rule." });
    }
  }

  const geoColumns: EntityColumn<GeoRule>[] = [
    { key: "title", header: "Content Title", render: (g) => <span className="font-bold text-white">{g.targetTitle}</span> },
    { key: "type", header: "Asset Type", render: (g) => <span className="capitalize text-cyan-300">{g.targetType}</span> },
    {
      key: "mode",
      header: "Distribution Scope",
      render: (g) => (
        <ConsoleStatusBadge
          status={g.mode === "worldwide" ? "active" : "pending"}
          label={g.mode.replace(/_/g, " ")}
        />
      ),
    },
    {
      key: "countries",
      header: "Enforced Territories",
      render: (g) => (
        <span className="font-mono text-xs text-slate-300">
          {g.mode === "worldwide" ? "Global (All Countries)" : g.countries.join(", ")}
        </span>
      ),
    },
    { key: "updated", header: "Last Modified", render: (g) => <span className="text-slate-400">{g.updatedAt}</span> },
  ];

  const kycColumns: EntityColumn<KycCountryRule>[] = [
    {
      key: "country",
      header: "Country & Flag",
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="text-xl">{r.flag}</span>
          <div>
            <div className="font-bold text-white">{r.name}</div>
            <div className="font-mono text-xs text-slate-400">{r.code} • Dial {r.dialCode}</div>
          </div>
        </div>
      ),
    },
    {
      key: "ruleType",
      header: "Rule Classification",
      render: (r) => (
        <ConsoleStatusBadge
          status={!r.isGeneric ? "active" : "pending"}
          label={!r.isGeneric ? "Tailored Rule" : "Generic Fallback"}
        />
      ),
    },
    {
      key: "acceptedIds",
      header: "Accepted Personal IDs",
      render: (r) => (
        <div className="max-w-xs truncate text-xs text-slate-300">
          {r.acceptedPersonalIdTypes.map((t) => t.label).join(", ")}
        </div>
      ),
    },
    {
      key: "taxAndBank",
      header: "Tax & Bank System",
      render: (r) => (
        <div className="text-xs">
          <div className="text-cyan-300 font-mono">{r.defaultCurrency} • {r.bankCodeSystem.toUpperCase()}</div>
          <div className="text-slate-400">{r.taxId.label}</div>
        </div>
      ),
    },
  ];

  const kycActions: EntityAction<KycCountryRule>[] = [
    {
      label: "Update Rule Policy (Audit Logged)",
      variant: "primary",
      icon: Edit3,
      requiresNotes: true,
      onClick: async (item, notes) => {
        await handleUpdateKycRule(item, notes);
      },
    },
  ];

  return (
    <div className="space-y-6">
      {notice && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold animate-in fade-in flex items-center gap-2 ${notice.type === "error" ? "bg-rose-600 text-white" : "bg-emerald-600 text-white"}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="ml-2 hover:opacity-80">✕</button>
        </div>
      )}
      {/* View Switcher Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 bg-[#030b2a] px-6 py-3">
        <button
          type="button"
          onClick={() => setActiveTab("kyc")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "kyc"
              ? "bg-cyan-500 text-[#031039]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Shield className="h-4 w-4" />
          KYC Country Rules (193 Countries)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("geo")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition ${
            activeTab === "geo"
              ? "bg-cyan-500 text-[#031039]"
              : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Globe2 className="h-4 w-4" />
          Content Geo-Distribution Policies
        </button>
      </div>

      {activeTab === "geo" ? (
        <ZillionaireEntityConsole
          account={account}
          title="Territory & Geo-Distribution Rules"
          subtitle="Control country-level allowlists and blocklists per video title, episode, and television stream."
          icon={Globe2}
          items={geoRules}
          columns={geoColumns}
          idKey="id"
          searchFields={["targetTitle", "targetId", "reason"]}
          kpis={[
            { title: "Total Geo Policies", value: geoRules.length, tone: "cyan" },
            { title: "Worldwide Titles", value: geoRules.filter((g) => g.mode === "worldwide").length, tone: "emerald" },
            { title: "Geo-Restricted", value: geoRules.filter((g) => g.mode !== "worldwide").length, tone: "amber" },
          ]}
          tabs={[
            { id: "all", label: "All Rules", filter: () => true },
            { id: "worldwide", label: "Worldwide", filter: (g) => g.mode === "worldwide" },
            { id: "restricted", label: "Restricted Territories", filter: (g) => g.mode !== "worldwide" },
          ]}
          detailFields={[
            { label: "Asset Title & ID", render: (g) => `${g.targetTitle} (${g.targetId})` },
            { label: "Rule Mode", render: (g) => g.mode },
            { label: "Territory List (ISO-2)", render: (g) => g.countries.length ? g.countries.join(", ") : "Worldwide" },
            { label: "Legal / Compliance Rationale", render: (g) => g.reason },
          ]}
        />
      ) : (
        <ZillionaireEntityConsole
          account={account}
          title="KYC Country Compliance Rules (193 Sovereign States)"
          subtitle="Manage data-driven identity verification, document types, tax identifiers, and bank systems across all 193 countries. Modifications require mandatory audit justifications."
          icon={Shield}
          items={kycRules}
          columns={kycColumns}
          actions={kycActions}
          idKey="code"
          searchFields={["name", "code", "dialCode", "defaultCurrency"]}
          kpis={[
            { title: "Total Sovereign States", value: kycRules.length, tone: "cyan" },
            { title: "Tailored Country Profiles", value: kycRules.filter((r) => !r.isGeneric).length, tone: "emerald" },
            { title: "Generic Fallback Profiles", value: kycRules.filter((r) => r.isGeneric).length, tone: "amber" },
            { title: "Customized Overrides", value: Object.keys(customOverrides).length, tone: "cyan" },
          ]}
          tabs={[
            { id: "all", label: "All 193 Countries", filter: () => true },
            { id: "tailored", label: "Tailored Profiles", filter: (r) => !r.isGeneric },
            { id: "generic", label: "Generic Fallbacks", filter: (r) => r.isGeneric },
          ]}
          detailFields={[
            { label: "Country Name & Code", render: (r) => `${r.flag} ${r.name} (${r.code})` },
            { label: "Calling Dial Code", render: (r) => r.dialCode },
            { label: "Primary Currency", render: (r) => r.defaultCurrency },
            { label: "Banking & Settlement Standard", render: (r) => r.bankCodeSystem.toUpperCase() },
            { label: "Tax Identifier Specification", render: (r) => `${r.taxId.label} (Required for payout: ${!r.taxId.optional ? "Yes" : "No"})` },
            { label: "Accepted Personal Identity Types", render: (r) => r.acceptedPersonalIdTypes.map((t) => `${t.label} (${t.formatDescription || "Official ID"})`).join(" • ") },
            { label: "Corporate Registry Configuration", render: (r) => r.companyRegistry ? `${r.companyRegistry.name} (${r.companyRegistry.label})` : "Standard Commercial Registry" },
          ]}
        />
      )}
    </div>
  );
}
