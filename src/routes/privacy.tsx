import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/privacy")({
  beforeLoad: () => { throw redirect({ to: "/legal/privacy-policy" }); },
  head: () => ({ meta: [{ title: "Privacy Policy | BQ SQWAD TV" }, { name: "robots", content: "index, follow" }] }),
});
