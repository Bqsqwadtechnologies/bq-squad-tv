import { createFileRoute } from "@tanstack/react-router";
import { PolicyPublicationNotice } from "@/components/status-pages";
export const Route = createFileRoute("/privacy")({
  component: () => <PolicyPublicationNotice title="Privacy notice" description="This page is reserved for the BQ SQWAD TV privacy notice, including the information we collect, why we use it, service providers, retention, account controls and contact details." />,
  head: () => ({ meta: [{ title: "Privacy notice | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});