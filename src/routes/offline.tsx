import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
export const Route = createFileRoute("/offline")({
  component: () => (
    <StatusPage
      title="You're offline"
      message="Check your internet connection, then try loading BQ SQWAD TV again. Your account and wallet information will refresh when you're connected."
      actionLabel="Try again"
    />
  ),
  head: () => ({
    meta: [
      { title: "Connection unavailable | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});
