import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckSquare, UserCheck, Clock, ShieldAlert, Award } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/moderation-workload")({
  component: ModerationWorkloadRoute,
  head: () => ({
    meta: [{ title: "Moderator Workload | Zillionaire Control Centre" }],
  }),
});

interface ModeratorWorkload {
  id: string;
  moderatorName: string;
  email: string;
  assignedQueue: "video_reviews" | "comment_flags" | "copyright_claims";
  pendingItems: number;
  completedToday: number;
  avgResolutionMinutes: number;
  activeStatus: "on_duty" | "break" | "offline";
}

const mockWorkloads: ModeratorWorkload[] = [
  {
    id: "mod_01",
    moderatorName: "Tunde Bakare",
    email: "tunde@bqsqwad.tv",
    assignedQueue: "video_reviews",
    pendingItems: 14,
    completedToday: 38,
    avgResolutionMinutes: 4.2,
    activeStatus: "on_duty",
  },
  {
    id: "mod_02",
    moderatorName: "Amina Yusuf",
    email: "amina@bqsqwad.tv",
    assignedQueue: "copyright_claims",
    pendingItems: 6,
    completedToday: 21,
    avgResolutionMinutes: 8.5,
    activeStatus: "on_duty",
  },
  {
    id: "mod_03",
    moderatorName: "Chidi Okafor",
    email: "chidi@bqsqwad.tv",
    assignedQueue: "comment_flags",
    pendingItems: 28,
    completedToday: 95,
    avgResolutionMinutes: 1.1,
    activeStatus: "break",
  },
];

function ModerationWorkloadRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="moderation">
      {(account) => <ModerationWorkloadContent account={account} />}
    </ConsolePageGuard>
  );
}

function ModerationWorkloadContent({ account }: { account: ConsoleAccount }) {
  const [items] = useState<ModeratorWorkload[]>(mockWorkloads);

  const columns: EntityColumn<ModeratorWorkload>[] = [
    { key: "name", header: "Moderator", render: (m) => <span className="font-bold text-white">{m.moderatorName}</span> },
    { key: "queue", header: "Assigned Queue", render: (m) => <span className="capitalize text-cyan-300 font-semibold">{m.assignedQueue.replace(/_/g, " ")}</span> },
    { key: "pending", header: "Pending Queue", render: (m) => <span className="font-mono text-amber-400 font-bold">{m.pendingItems} items</span> },
    { key: "done", header: "Completed Today", render: (m) => <span className="font-mono text-emerald-400 font-bold">{m.completedToday}</span> },
    { key: "speed", header: "Avg Time", render: (m) => <span className="text-slate-300">{m.avgResolutionMinutes} min / item</span> },
    { key: "status", header: "Duty Status", render: (m) => <ConsoleStatusBadge status={m.activeStatus === "on_duty" ? "active" : "pending"} label={m.activeStatus.replace(/_/g, " ")} /> },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Moderation Team & Queue Workload"
      subtitle="Monitor live queue depths, assign reviewer portfolios, and track operational SLA response times."
      icon={CheckSquare}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["moderatorName", "email", "assignedQueue"]}
      kpis={[
        { title: "Active Moderators", value: items.filter((m) => m.activeStatus === "on_duty").length, tone: "emerald" },
        { title: "Total Pending Queue", value: items.reduce((s, m) => s + m.pendingItems, 0), tone: "amber" },
        { title: "Resolved Today", value: items.reduce((s, m) => s + m.completedToday, 0), tone: "cyan" },
      ]}
      tabs={[
        { id: "all", label: "All Staff", filter: () => true },
        { id: "duty", label: "On Duty", filter: (m) => m.activeStatus === "on_duty" },
      ]}
      detailFields={[
        { label: "Moderator Profile", render: (m) => `${m.moderatorName} (${m.email})` },
        { label: "Focus Domain", render: (m) => m.assignedQueue.replace(/_/g, " ").toUpperCase() },
        { label: "Velocity Metric", render: (m) => `${m.avgResolutionMinutes} minutes average resolution speed` },
      ]}
    />
  );
}
