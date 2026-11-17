import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/terms")({
  beforeLoad: () => { throw redirect({ to: "/legal/terms" }); },
  head: () => ({ meta: [{ title: "Terms | BQ SQWAD TV" }, { name: "robots", content: "index, follow" }] }),
});
