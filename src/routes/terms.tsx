import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/terms")({
  component: () => <LegalPageView slug="terms" />,
  head: () => ({
    meta: [
      { title: "Terms of Service | BQ SQWAD TV" },
      { name: "description", content: "Read the BQ SQWAD TV Terms of Service." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
