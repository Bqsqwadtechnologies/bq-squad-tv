import { createFileRoute } from "@tanstack/react-router";
import { PolicyPublicationNotice } from "@/components/status-pages";
export const Route = createFileRoute("/producer-terms")({
  component: () => <PolicyPublicationNotice title="Producer terms" description="This page is reserved for the approved producer agreement, including content ownership, distribution rights, territory and term restrictions, revenue statements, payouts and producer responsibilities." />,
  head: () => ({ meta: [{ title: "Producer terms | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});