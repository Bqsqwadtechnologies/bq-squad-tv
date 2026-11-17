import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
export const Route = createFileRoute("/age-restriction")({
  component: () => <StatusPage title="Age restriction" message="This programme has an age restriction. You can continue browsing content that is available for your account." actionLabel="Browse available programmes" />,
  head: () => ({ meta: [{ title: "Age restriction | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});