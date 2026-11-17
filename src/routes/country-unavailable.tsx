import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";

export const Route = createFileRoute("/country-unavailable")({
  component: () => <StatusPage title="Not available in your region" message="This title cannot be shown in your current region because of its distribution rights. You can still browse other available content." actionLabel="Browse available content" secondaryHref="/help" secondaryLabel="Get help" />,
  head: () => ({ meta: [{ title: "Not available in your region | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});
