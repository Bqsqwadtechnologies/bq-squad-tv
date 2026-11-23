import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Plus, Bell, Eye, CheckCircle, XCircle } from "lucide-react";
import { ConsolePageGuard, type ConsoleAccount } from "@/components/ConsolePageGuard";
import { ZillionaireEntityConsole, type EntityColumn, type EntityAction } from "@/components/ZillionaireEntityConsole";
import { ConsoleStatusBadge } from "@/components/ConsoleShell";

export const Route = createFileRoute("/zillionaire/announcements")({
  component: AnnouncementsRoute,
  head: () => ({
    meta: [{ title: "Announcements & Banners | Zillionaire Control Centre" }],
  }),
});

interface Announcement {
  id: string;
  title: string;
  message: string;
  targetAudience: "all" | "viewers" | "producers" | "providers";
  bannerType: "info" | "warning" | "promotion";
  active: boolean;
  ctaText?: string;
  ctaLink?: string;
  startDate: string;
  endDate: string;
}

const mockAnnouncements: Announcement[] = [
  {
    id: "ann_001",
    title: "Scheduled Maintenance Window",
    message: "HLS transcoding cluster will undergo scheduled maintenance on Sunday 02:00 UTC.",
    targetAudience: "producers",
    bannerType: "warning",
    active: true,
    startDate: "2026-03-24",
    endDate: "2026-03-30",
  },
  {
    id: "ann_002",
    title: "Weekend Nollywood Premieres",
    message: "Enjoy 20% cashback in your wallet on all movies this weekend!",
    targetAudience: "viewers",
    bannerType: "promotion",
    active: true,
    ctaText: "Browse Movies",
    ctaLink: "/movies",
    startDate: "2026-03-27",
    endDate: "2026-03-29",
  },
];

function AnnouncementsRoute() {
  return (
    <ConsolePageGuard requiredRole="zillionaire" requiredModule="pages">
      {({ account }) => <AnnouncementsContent account={account} />}
    </ConsolePageGuard>
  );
}

function AnnouncementsContent({ account }: { account: ConsoleAccount }) {
  const [items, setItems] = useState<Announcement[]>(mockAnnouncements);

  const columns: EntityColumn<Announcement>[] = [
    { key: "title", header: "Announcement Title", render: (a) => <span className="font-bold text-white">{a.title}</span> },
    { key: "audience", header: "Target Audience", render: (a) => <span className="capitalize text-cyan-300">{a.targetAudience}</span> },
    { key: "type", header: "Type", render: (a) => <span className="capitalize text-slate-300">{a.bannerType}</span> },
    { key: "status", header: "Status", render: (a) => <ConsoleStatusBadge status={a.active ? "active" : "inactive"} label={a.active ? "Live" : "Draft"} /> },
    { key: "dates", header: "Window", render: (a) => <span className="text-slate-400">{a.startDate} to {a.endDate}</span> },
  ];

  const actions: EntityAction<Announcement>[] = [
    {
      label: "Toggle Live Status",
      variant: "primary",
      onClick: (item) => {
        setItems((prev) => prev.map((a) => (a.id === item.id ? { ...a, active: !a.active } : a)));
      },
    },
  ];

  return (
    <ZillionaireEntityConsole
      account={account}
      title="Announcements & Sitewide Banners"
      subtitle="Publish header banners and targeted notices for viewers, studios, and television broadcast partners."
      icon={Megaphone}
      items={items}
      columns={columns}
      idKey="id"
      searchFields={["title", "message", "targetAudience"]}
      kpis={[
        { title: "Total Banners", value: items.length, tone: "cyan" },
        { title: "Active Live Banners", value: items.filter((a) => a.active).length, tone: "emerald" },
      ]}
      tabs={[
        { id: "all", label: "All Banners", filter: () => true },
        { id: "active", label: "Live Now", filter: (a) => a.active },
        { id: "inactive", label: "Inactive / Draft", filter: (a) => !a.active },
      ]}
      actions={actions}
      detailFields={[
        { label: "Title", render: (a) => a.title },
        { label: "Target Audience", render: (a) => a.targetAudience },
        { label: "Banner Style", render: (a) => a.bannerType },
        { label: "Banner Message", render: (a) => a.message },
        { label: "Call to Action", render: (a) => a.ctaText ? `${a.ctaText} -> ${a.ctaLink}` : "None" },
      ]}
    />
  );
}
