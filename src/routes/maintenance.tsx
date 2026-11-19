import { createFileRoute } from "@tanstack/react-router";
import { StatusPage } from "@/components/status-pages";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/maintenance")({
  component: MaintenancePage,
  head: () => ({
    meta: [
      { title: "Temporarily unavailable | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});

function MaintenancePage() {
  const [customMessage, setCustomMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/public/v1/config/client")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.maintenance?.message) {
          setCustomMessage(data.maintenance.message);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <StatusPage
      title="We’ll be back soon"
      message={
        customMessage ||
        "BQ SQWAD TV is temporarily unavailable while we make improvements. Please try again shortly."
      }
      actionLabel="Try again"
      actionHref="/"
      secondaryHref="/help"
      secondaryLabel="Get help"
    />
  );
}
