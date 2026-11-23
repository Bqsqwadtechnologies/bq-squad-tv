import { createFileRoute, Navigate } from "@tanstack/react-router";

// Legacy channel-first uploader has been retired. Keep old bookmarks working
// by sending users to the channel-free platform Upload Studio.
export const Route = createFileRoute("/zillionaire/video-studio")({
  component: () => <Navigate to="/zillionaire/upload-studio" replace />,
});
