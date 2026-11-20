import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/provider-terms")({
  component: () => <LegalPageView slug="provider-terms" />,
  head: () => ({
    meta: [
      { title: "Licensed Channel Provider Terms | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Licensed Channel Provider Terms." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
