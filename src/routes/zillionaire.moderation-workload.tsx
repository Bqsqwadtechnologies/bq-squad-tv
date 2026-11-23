import { useEffect, useState, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckSquare, UserCheck, Clock, ShieldAlert, Award, Loader2 } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/moderation-workload")({
  component: ModerationWorkloadRoute,
  head: () => ({
    meta: [
      { title: "Moderator Workload | Zillionaire Control Centre" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
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

function ModerationWorkloadRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="moderation">
      {({ account }) => <ModerationWorkloadContent account={account} />}
    </ConsolePageGuard>
  );
}

function ModerationWorkloadContent({ account }: { account: ConsoleAccount }) {
  const [items, setItems] = useState<ModeratorWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchWorkload() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/v1/zillionaire/moderation/workload");
      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.workloads) ? data.workloads : [];
        setItems(list);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || "Failed to load moderation workload");
      }
    } catch {
      setError("Network error fetching moderation workload.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchWorkload();
  }, []);

  const columns: EntityColumn<ModeratorWorkload>[] = [
    {
      key: "moderator",
      header: "Moderator",
      render: (m) => (
        <div>
          <span className="font-semibold text-foreground block">{m.moderatorName}</span>
          <span className="text-xs text-muted-foreground">{m.email}</span>
        </div>
      ),
    },
    { key: "queue", header: "Assigned Queue", render: (m) => <span className="capitalize text-muted-foreground">{m.assignedQueue.replace(/_/g, " ")}</span> },
    {
      key: "pending",
      header: "Pending Backlog",
      render: (m) => (
        <span className={`font-mono font-bold ${m.pendingItems > 15 ? "text-rose-400" : "text-foreground"}`}>
          {m.pendingItems} items
        </span>
      ),
    },
    { key: "completed", header: "Completed Today", render: (m) => <span className="font-mono font-bold text-emerald-400">{m.completedToday}</span> },
    { key: "avgTime", header: "Avg Resolution", render: (m) => <span className="font-mono text-muted-foreground">{m.avgResolutionMinutes} min</span> },
    {
      key: "status",
      header: "Shift Status",
      render: (m) => (
        <ConsoleStatusBadge
          status={m.activeStatus === "on_duty" ? "active" : m.activeStatus === "break" ? "pending" : "inactive"}
          label={m.activeStatus.replace(/_/g, " ")}
        />
      ),
    },
  ];

  const kpis = useMemo(() => [
    { title: "Active Team Members", value: items.filter((m) => m.activeStatus === "on_duty").length, tone: "emerald" as const },
    { title: "Total Pending Backlog", value: items.reduce((sum, m) => sum + m.pendingItems, 0), tone: "amber" as const },
    { title: "Total Actions Today", value: items.reduce((sum, m) => sum + m.completedToday, 0), tone: "cyan" as const },
  ], [items]);

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Moderator Workload & Queue Allocation"
      subtitle="Track active moderator shifts, queue backlogs, and throughput performance metrics across trust & safety teams."
      icon={CheckSquare}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["moderatorName", "email", "assignedQueue"]}
      kpis={kpis}
      tabs={[
        { id: "all", label: "All Reviewers", filter: () => true },
        { id: "on_duty", label: "On Duty", filter: (m) => m.activeStatus === "on_duty" },
        { id: "backlog", label: "High Backlog (>10)", filter: (m) => m.pendingItems > 10 },
      ]}
      actions={[]}
      detailFields={[
        { label: "Reviewer", render: (m) => `${m.moderatorName} (${m.email})` },
        { label: "Assigned Queue", render: (m) => m.assignedQueue.replace(/_/g, " ") },
        { label: "Throughput Today", render: (m) => `${m.completedToday} actions completed` },
        { label: "Average Time per Item", render: (m) => `${m.avgResolutionMinutes} minutes` },
      ]}
    />
  );
}
