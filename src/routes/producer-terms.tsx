import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/producer-terms")({
  component: () => <LegalPageView slug="producer-terms" />,
  head: () => ({
    meta: [
      { title: "Producer Terms and Conditions | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Producer Terms and Conditions." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
