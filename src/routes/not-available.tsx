import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
export const Route = createFileRoute("/not-available")({
  component: () => (
    <StatusPage
      title="Not available in your country"
      message="This programme is not currently licensed for viewing in your country. Availability can change when distribution rights are updated."
      actionLabel="Browse available programmes"
    />
  ),
  head: () => ({
    meta: [
      { title: "Programme unavailable | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});
