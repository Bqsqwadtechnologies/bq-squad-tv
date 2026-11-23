import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/zillionaire/video-studio")({
  beforeLoad: () => {
    throw redirect({ to: "/zillionaire/upload-studio" });
  },
  component: () => null,
  head: () => ({
    meta: [
      { title: "Video Studio | BQ SQWAD TV" },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
});
