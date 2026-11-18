import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z.object({
  programId: z.string().trim().min(1).max(100),
  channelId: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  startTime: z.string().datetime(),
}).strict();

export const Route = createFileRoute("/api/public/v1/epg/remind")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          const reminderId = `${body.programId}_${user.uid}`;
          await fs.setDoc(`users/${user.uid}/reminders/${reminderId}`, {
            id: reminderId,
            programId: body.programId,
            channelId: body.channelId,
            title: body.title,
            startTime: body.startTime,
            createdAt: new Date().toISOString(),
          });

          return Response.json({ reminded: true, reminderId });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
