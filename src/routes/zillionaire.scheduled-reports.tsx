import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, Clock, Download, FileText, CheckCircle2 } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/scheduled-reports")({
  component: ScheduledReportsRoute,
  head: () => ({
    meta: [{ title: "Scheduled Email Reports | Zillionaire Control Centre" }],
  }),
});

interface ScheduledReportConfig {
  id: string;
  reportName: string;
  frequency: "daily" | "weekly" | "monthly";
  format: "pdf" | "csv" | "both";
  recipients: string[];
  lastDispatchedAt: string;
  active: boolean;
}

const mockConfigs: ScheduledReportConfig[] = [
  {
    id: "rep_cfg_01",
    reportName: "Daily Financial & Revenue Settlement Summary",
    frequency: "daily",
    format: "both",
    recipients: ["zillionaire@bqsqwad.tv", "finance@bqsqwad.tv"],
    lastDispatchedAt: "2026-03-24T00:01:00Z",
    active: true,
  },
  {
    id: "rep_cfg_02",
    reportName: "Weekly Copyright Violations & Piracy Takedowns",
    frequency: "weekly",
    format: "pdf",
    recipients: ["legal@bqsqwad.tv", "compliance@bqsqwad.tv"],
    lastDispatchedAt: "2026-03-23T08:00:00Z",
    active: true,
  },
  {
    id: "rep_cfg_03",
    reportName: "Monthly Creator & Network Disbursement Audit",
    frequency: "monthly",
    format: "both",
    recipients: ["zillionaire@bqsqwad.tv"],
    lastDispatchedAt: "2026-03-01T00:05:00Z",
    active: true,
  },
];

function ScheduledReportsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="finance">
      {(account) => <ScheduledReportsContent account={account} />}
    </ConsolePageGuard>
  );
}

function ScheduledReportsContent({ account }: { account: ConsoleAccount }) {
  const [configs, setConfigs] = useState<ScheduledReportConfig[]>(mockConfigs);

  const columns: EntityColumn<ScheduledReportConfig>[] = [
    { key: "name", header: "Report Title", render: (r) => <span className="font-bold text-white">{r.reportName}</span> },
    { key: "freq", header: "Cadence", render: (r) => <span className="capitalize text-cyan-300 font-semibold">{r.frequency}</span> },
    { key: "format", header: "Output Format", render: (r) => <span className="uppercase text-slate-300 font-mono">{r.format}</span> },
    { key: "recipients", header: "Recipient List", render: (r) => <span className="text-slate-400 text-xs">{r.recipients.join(", ")}</span> },
    { key: "status", header: "Status", render: (r) => <ConsoleStatusBadge status={r.active ? "active" : "inactive"} label={r.active ? "Active Schedule" : "Paused"} /> },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Scheduled Automated Reports"
      subtitle="Configure recurring automated dispatch of comprehensive PDF statements and CSV exports by email."
      icon={Mail}
      items={configs}
      columns={columns}
      idKey="id"
      searchFields={["reportName", "frequency"]}
      kpis={[
        { title: "Configured Schedules", value: configs.length, tone: "cyan" },
        { title: "Active Daily Reports", value: configs.filter((c) => c.frequency === "daily").length, tone: "emerald" },
      ]}
      tabs={[
        { id: "all", label: "All Schedules", filter: () => true },
        { id: "active", label: "Active", filter: (c) => c.active },
      ]}
      detailFields={[
        { label: "Report Name", render: (c) => c.reportName },
        { label: "Dispatch Cadence", render: (c) => c.frequency },
        { label: "Delivery Attachments", render: (c) => c.format.toUpperCase() },
        { label: "Designated Recipients", render: (c) => c.recipients.join(", ") },
        { label: "Last Successful Transmission", render: (c) => new Date(c.lastDispatchedAt).toLocaleString() },
      ]}
    />
  );
}
