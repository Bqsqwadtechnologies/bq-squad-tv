import { createFileRoute } from "@tanstack/react-router";
import { PolicyPublicationNotice } from "@/components/status-pages";
export const Route = createFileRoute("/terms")({
  component: () => <PolicyPublicationNotice title="Terms of service" description="This page is reserved for the approved BQ SQWAD TV terms, including accounts, viewing charges, wallet use, payments, content availability, acceptable use and support." />,
  head: () => ({ meta: [{ title: "Terms of service | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});