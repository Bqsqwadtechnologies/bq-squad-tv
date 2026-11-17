import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";

export const Route = createFileRoute("/waiting-room")({
  component: () => <StatusPage title="High demand right now" message="There are more viewers than usual. Please wait a little and try again. Your account and wallet are not affected by this waiting page." actionLabel="Back home" secondaryHref="/help" secondaryLabel="Get help" />,
  head: () => ({ meta: [{ title: "High demand | BQ SQWAD TV" }, { name: "robots", content: "noindex, nofollow, noarchive" }] }),
});
