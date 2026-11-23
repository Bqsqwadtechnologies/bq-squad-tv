import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Activity, Server, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/status-page")({
  component: StatusPageEditorRoute,
  head: () => ({
    meta: [{ title: "Status Page Editor | Zillionaire Control Centre" }],
  }),
});

interface SubsystemHealth {
  id: string;
  name: string;
  description: string;
  status: "operational" | "degraded_performance" | "partial_outage" | "major_outage";
  uptime30Days: number;
  lastIncidentAt?: string;
}

const mockSubsystems: SubsystemHealth[] = [
  {
    id: "sub_cdn",
    name: "Video Delivery & Edge CDN",
    description: "Global edge network delivering HLS and MP4 streams.",
    status: "operational",
    uptime30Days: 99.98,
  },
  {
    id: "sub_pay",
    name: "Payment Gateway & Top-Up API",
    description: "Stripe and Paystack automated wallet funding rails.",
    status: "operational",
    uptime30Days: 99.95,
  },
  {
    id: "sub_live",
    name: "Live Broadcast Transcoding",
    description: "RTMP ingestion and low-latency HLS packaging.",
    status: "operational",
    uptime30Days: 99.90,
  },
  {
    id: "sub_auth",
    name: "Identity & Firebase Auth",
    description: "Credential authentication, session verification, and roles.",
    status: "operational",
    uptime30Days: 100.0,
  },
];

function StatusPageEditorRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="settings">
      {({ account }) => <StatusPageContent account={account} />}
    </ConsolePageGuard>
  );
}

function StatusPageContent({ account }: { account: ConsoleAccount }) {
  const [systems, setSystems] = useState<SubsystemHealth[]>(mockSubsystems);

  const columns: EntityColumn<SubsystemHealth>[] = [
    { key: "name", header: "Subsystem", render: (s) => <span className="font-bold text-white">{s.name}</span> },
    { key: "desc", header: "Infrastructure Scope", render: (s) => <span className="text-slate-400 text-xs truncate max-w-xs">{s.description}</span> },
    { key: "uptime", header: "30-Day Uptime", render: (s) => <span className="font-mono text-emerald-400 font-bold">{s.uptime30Days}%</span> },
    { key: "status", header: "Health Status", render: (s) => <ConsoleStatusBadge status={s.status === "operational" ? "active" : "pending"} label={s.status.replace(/_/g, " ")} /> },
  ];

  const actions: EntityAction<SubsystemHealth>[] = [
    {
      label: "Mark Degraded",
      variant: "destructive",
      onClick: (item) => {
        setSystems((prev) => prev.map((s) => s.id === item.id ? { ...s, status: "degraded_performance" } : s));
      },
    },
    {
      label: "Mark Operational",
      variant: "success",
      onClick: (item) => {
        setSystems((prev) => prev.map((s) => s.id === item.id ? { ...s, status: "operational" } : s));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Platform Status & Subsystem Health Editor"
      subtitle="Publish live infrastructure component statuses and transparent maintenance disclosures."
      icon={Activity}
      items={systems}
      columns={columns}
      idKey="id"
      searchFields={["name", "description"]}
      kpis={[
        { title: "Monitored Subsystems", value: systems.length, tone: "cyan" },
        { title: "Operational Systems", value: systems.filter((s) => s.status === "operational").length, tone: "emerald" },
      ]}
      tabs={[
        { id: "all", label: "All Subsystems", filter: () => true },
      ]}
      actions={actions}
      detailFields={[
        { label: "Component Name", render: (s) => s.name },
        { label: "Description", render: (s) => s.description },
        { label: "Rolling 30d SLA", render: (s) => `${s.uptime30Days}%` },
      ]}
    />
  );
}
