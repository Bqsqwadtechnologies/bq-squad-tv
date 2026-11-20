import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/producer-privacy")({
  component: () => <LegalPageView slug="producer-privacy" />,
  head: () => ({
    meta: [
      { title: "Producer Privacy Notice | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Producer Privacy Notice." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
