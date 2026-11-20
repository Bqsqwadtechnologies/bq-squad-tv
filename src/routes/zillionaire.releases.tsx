import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone, ShieldAlert, AlertTriangle, CheckCircle2, RotateCcw, Download } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/releases")({
  component: ReleasesControlRoute,
  head: () => ({
    meta: [{ title: "Release & Maintenance Control | Zillionaire Control Centre" }],
  }),
});

interface AppReleaseRule {
  id: string;
  platform: "android" | "web_pwa" | "android_tv";
  currentLiveVersion: string;
  minSupportedVersion: string;
  minVersionCode: number;
  forceUpdate: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  downloadUrl: string;
  updatedAt: string;
}

const mockReleaseRules: AppReleaseRule[] = [
  {
    id: "rel_android_mobile",
    platform: "android",
    currentLiveVersion: "6.2.0",
    minSupportedVersion: "6.0.0",
    minVersionCode: 600,
    forceUpdate: false,
    maintenanceMode: false,
    maintenanceMessage: "BQ SQWAD TV Android client is operating normally.",
    downloadUrl: "https://play.google.com/store/apps/details?id=com.bqsqwad.tv",
    updatedAt: "2026-03-24",
  },
  {
    id: "rel_web_client",
    platform: "web_pwa",
    currentLiveVersion: "6.2.0",
    minSupportedVersion: "6.2.0",
    minVersionCode: 620,
    forceUpdate: false,
    maintenanceMode: false,
    maintenanceMessage: "Web application is operational.",
    downloadUrl: "https://bqsqwad.tv",
    updatedAt: "2026-03-24",
  },
];

function ReleasesControlRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="settings">
      {(account) => <ReleasesControlContent account={account} />}
    </ConsolePageGuard>
  );
}

function ReleasesControlContent({ account }: { account: ConsoleAccount }) {
  const [rules, setRules] = useState<AppReleaseRule[]>(mockReleaseRules);

  const columns: EntityColumn<AppReleaseRule>[] = [
    { key: "platform", header: "Client Platform", render: (r) => <span className="font-bold uppercase text-cyan-300">{r.platform}</span> },
    { key: "live", header: "Live Production", render: (r) => <span className="font-mono text-white">v{r.currentLiveVersion}</span> },
    { key: "min", header: "Minimum Version", render: (r) => <span className="font-mono text-slate-300">v{r.minSupportedVersion}</span> },
    {
      key: "force",
      header: "Force Update",
      render: (r) => <ConsoleStatusBadge status={r.forceUpdate ? "pending" : "active"} label={r.forceUpdate ? "Forced" : "Optional"} />,
    },
    {
      key: "maint",
      header: "Maintenance Lock",
      render: (r) => <ConsoleStatusBadge status={r.maintenanceMode ? "inactive" : "active"} label={r.maintenanceMode ? "LOCKED" : "Online"} />,
    },
  ];

  const actions: EntityAction<AppReleaseRule>[] = [
    {
      label: "Toggle Force Update",
      variant: "primary",
      onClick: (item) => {
        setRules((prev) => prev.map((r) => r.id === item.id ? { ...r, forceUpdate: !r.forceUpdate } : r));
      },
    },
    {
      label: "Toggle Emergency Maintenance",
      variant: "destructive",
      requiresNotes: true,
      onClick: (item) => {
        setRules((prev) => prev.map((r) => r.id === item.id ? { ...r, maintenanceMode: !r.maintenanceMode } : r));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="App Release & Maintenance Control"
      subtitle="Manage Android APK minimum versions, mandatory upgrade gates, and instant emergency platform locks."
      icon={Smartphone}
      items={rules}
      columns={columns}
      idKey="id"
      searchFields={["platform", "currentLiveVersion"]}
      kpis={[
        { title: "Managed Platforms", value: rules.length, tone: "cyan" },
        { title: "Force Update Active", value: rules.filter((r) => r.forceUpdate).length, tone: "amber" },
        { title: "Maintenance Locked", value: rules.filter((r) => r.maintenanceMode).length, tone: "rose" },
      ]}
      tabs={[
        { id: "all", label: "All Platforms", filter: () => true },
      ]}
      actions={actions}
      detailFields={[
        { label: "Target Client Platform", render: (r) => r.platform.toUpperCase() },
        { label: "Production Release Version", render: (r) => `v${r.currentLiveVersion} (Build Code ${r.minVersionCode})` },
        { label: "Minimum Non-Forced Version", render: (r) => `v${r.minSupportedVersion}` },
        { label: "Download / Store Destination", render: (r) => r.downloadUrl },
        { label: "Emergency Notice Copy", render: (r) => r.maintenanceMessage },
      ]}
    />
  );
}
