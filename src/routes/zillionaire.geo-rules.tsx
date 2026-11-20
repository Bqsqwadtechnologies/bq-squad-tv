import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Globe2, Shield, Check, X, AlertCircle } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

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
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="content">
      {(account) => <GeoRulesContent account={account} />}
    </ConsolePageGuard>
  );
}

function GeoRulesContent({ account }: { account: ConsoleAccount }) {
  const [rules, setRules] = useState<GeoRule[]>(mockGeoRules);

  const columns: EntityColumn<GeoRule>[] = [
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

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Territory & Geo-Distribution Rules"
      subtitle="Control country-level allowlists and blocklists per video title, episode, and television stream."
      icon={Globe2}
      items={rules}
      columns={columns}
      idKey="id"
      searchFields={["targetTitle", "targetId", "reason"]}
      kpis={[
        { title: "Total Geo Policies", value: rules.length, tone: "cyan" },
        { title: "Worldwide Titles", value: rules.filter((g) => g.mode === "worldwide").length, tone: "emerald" },
        { title: "Geo-Restricted", value: rules.filter((g) => g.mode !== "worldwide").length, tone: "amber" },
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
  );
}
