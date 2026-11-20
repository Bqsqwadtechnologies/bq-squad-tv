import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/provider-privacy-policy")({
  component: () => <LegalPageView slug="provider-privacy" />,
  head: () => ({
    meta: [
      { title: "Provider Privacy Notice | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Channel Provider Privacy Notice." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
