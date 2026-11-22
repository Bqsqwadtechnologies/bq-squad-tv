import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { computeChannelChecklist } from "@/lib/server/partner-checklist";

export const Route = createFileRoute("/api/public/v1/provider/channels/$id/checklist")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const channel = await fs.getDoc(`channels/${params.id}`);
          if (!channel) {
            throw new ApiError(404, "CHANNEL_NOT_FOUND", "Channel not found.");
          }

          const partnerId = String(channel["partnerId"] || channel["ownerUid"] || "");
          const allowedEmails = Array.isArray(channel["allowedEmails"])
            ? (channel["allowedEmails"] as string[])
            : [];

          let hasAccess = partnerId === user.uid || (user.email && allowedEmails.includes(user.email));

          if (!hasAccess) {
            const operator = await fs.getDoc(`consoleAccounts/${user.uid}`);
            if (operator) hasAccess = true;
          }

          if (!hasAccess) {
            throw new ApiError(403, "ACCESS_DENIED", "You do not have permission to view this channel checklist.");
          }

          const checklist = computeChannelChecklist(channel);

          return Response.json({
            success: true,
            checklist,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
