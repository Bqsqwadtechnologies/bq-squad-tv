import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
export const Route = createFileRoute("/maintenance")({
  component: () => <StatusPage title="We’ll be back soon" message="BQ SQWAD TV is temporarily unavailable while we make improvements. Please try again shortly." actionLabel="Try again" actionHref="/" secondaryHref="/help" secondaryLabel="Get help" />,
  head: () => ({ meta: [{ title: "Temporarily unavailable | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});