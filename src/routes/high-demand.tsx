import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
export const Route = createFileRoute("/high-demand")({
  component: () => (
    <StatusPage
      title="A lot of people are watching"
      message="We’re experiencing high demand right now. Please wait a moment and try again. We’ll keep your account and wallet details protected."
      actionLabel="Try again"
    />
  ),
  head: () => ({
    meta: [
      { title: "High demand | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});
