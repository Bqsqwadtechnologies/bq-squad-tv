import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/LegalPageView";

export const Route = createFileRoute("/account-deletion")({
  component: () => <LegalPageView slug="account-deletion" />,
  head: () => ({
    meta: [
      { title: "Account Deletion Policy & Instructions | BQ SQWAD TV" },
      { name: "description", content: "How to delete your BQ SQWAD TV account and associated data." },
      { name: "robots", content: "index, follow" },
    ],
  }),
});
