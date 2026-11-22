export interface DashboardPermission {
  id: string;
  label: string;
  description: string;
  module: string;
  category: "operations" | "content" | "finance" | "security" | "system";
}

export const DASHBOARD_PERMISSIONS: DashboardPermission[] = [
  {
    id: "users",
    label: "Users",
    description: "Inspect viewer accounts, status, and viewer activities",
    module: "users",
    category: "operations",
  },
  {
    id: "content_review",
    label: "Content Review",
    description: "Review, approve, reject, and catalogue submitted movies and series",
    module: "catalog",
    category: "content",
  },
  {
    id: "rights_review",
    label: "Rights Review",
    description: "Inspect copyright chain of title, licensing documents, and claims",
    module: "rights_review",
    category: "content",
  },
  {
    id: "live_approvals",
    label: "Live Approvals",
    description: "Review, schedule, approve, or force-stop live stream events",
    module: "live_approvals",
    category: "content",
  },
  {
    id: "channels",
    label: "Channels",
    description: "Manage 24/7 linear broadcast channels, feeds, and EPG schedules",
    module: "channels",
    category: "content",
  },
  {
    id: "pricing",
    label: "Pricing",
    description: "Configure per-minute rates, promo schedules, and content bundles",
    module: "pricing",
    category: "finance",
  },
  {
    id: "finance",
    label: "Finance",
    description: "View consolidated revenue ledgers, gross margins, and balances",
    module: "finance",
    category: "finance",
  },
  {
    id: "payouts",
    label: "Payouts",
    description: "Disburse, track, fail, or reverse partner payout settlements",
    module: "payouts",
    category: "finance",
  },
  {
    id: "ads",
    label: "Ads",
    description: "Configure advertising networks, video mid-rolls, and campaigns",
    module: "ads",
    category: "operations",
  },
  {
    id: "notifications",
    label: "Notifications",
    description: "Send push notifications, alerts, and transactional messages",
    module: "notifications",
    category: "operations",
  },
  {
    id: "moderation",
    label: "Moderation",
    description: "Moderate comments, ratings, reviews, and community flags",
    module: "moderation",
    category: "operations",
  },
  {
    id: "support",
    label: "Support",
    description: "Manage customer support inquiries, partner disputes, and tickets",
    module: "support",
    category: "operations",
  },
  {
    id: "security",
    label: "Security",
    description: "Inspect security events, rate limits, step-up, and audit trails",
    module: "security",
    category: "security",
  },
  {
    id: "pages",
    label: "Pages",
    description: "Manage editorial copy, terms of service, and public legal policies",
    module: "pages",
    category: "system",
  },
  {
    id: "storage",
    label: "Storage",
    description: "Monitor B2/Lovable storage pools, asset egress, and replication",
    module: "storage",
    category: "system",
  },
  {
    id: "reports",
    label: "Reports",
    description: "Generate DMCA, platform performance, and compliance reports",
    module: "reports",
    category: "operations",
  },
  {
    id: "team_view",
    label: "Team View",
    description: "Inspect staff members, assigned permissions, and active delegates",
    module: "roles",
    category: "security",
  },
];

export type ProducerScope = "upload" | "analytics" | "comments" | "collaboration";

export const PRODUCER_SCOPES: { id: ProducerScope; label: string; description: string }[] = [
  {
    id: "upload",
    label: "Upload & Media",
    description: "Upload video assets, edit metadata, and manage content drafts",
  },
  {
    id: "analytics",
    label: "Analytics & Metrics",
    description: "Inspect watch-time stats, revenue performance, and viewer traffic",
  },
  {
    id: "comments",
    label: "Community & Comments",
    description: "Moderate user discussions, reply to viewers, and manage ratings",
  },
  {
    id: "collaboration",
    label: "Collaborations & Splits",
    description: "Create split agreements, confirm shares, and manage co-productions",
  },
];

export type ProviderScope = "channels" | "schedule" | "statements";

export const PROVIDER_SCOPES: { id: ProviderScope; label: string; description: string }[] = [
  {
    id: "channels",
    label: "Channels & Ingest",
    description: "Manage linear channels, HLS endpoints, and encoder credentials",
  },
  {
    id: "schedule",
    label: "EPG & Scheduling",
    description: "Program broadcast schedules, live events, and program guides",
  },
  {
    id: "statements",
    label: "Statements & Payouts",
    description: "Review monthly distribution statements and disbursement records",
  },
];

export type PartnerRole = "Owner" | "Manager" | "Editor" | "Viewer";

export const PARTNER_ROLES: { id: PartnerRole; label: string; description: string; defaultScopes: ProviderScope[] }[] = [
  {
    id: "Owner",
    label: "Owner",
    description: "First assigned company email, full partner control",
    defaultScopes: ["channels", "schedule", "statements"],
  },
  {
    id: "Manager",
    label: "Manager",
    description: "Manage channel streams, programming schedules, and distribution statements",
    defaultScopes: ["channels", "schedule", "statements"],
  },
  {
    id: "Editor",
    label: "Editor",
    description: "Configure channel ingest, live events, and EPG schedules",
    defaultScopes: ["channels", "schedule"],
  },
  {
    id: "Viewer",
    label: "Viewer",
    description: "Read-only access to channel feeds and distribution statements",
    defaultScopes: ["statements"],
  },
];
