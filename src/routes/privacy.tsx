import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/privacy")({
  component: () => <LegalPageView slug="privacy-policy" />,
  head: () => ({
    meta: [
      { title: "Privacy Policy | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Privacy Policy." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
