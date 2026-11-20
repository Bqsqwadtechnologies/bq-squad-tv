import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

const actionSchema = z
  .object({
    commentId: z.string().min(1),
    action: z.enum(["approve", "hide", "delete"]),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/zillionaire/comments/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const snap = await fs.getCollection("commentsQueue");
          const items = (snap.docs || []).map((doc) => doc.data);

          return Response.json({
            comments: items.length > 0 ? items : [
              {
                id: "comment_1",
                contentTitle: "Lagos Nights - Episode 1",
                authorEmail: "viewer1@example.com",
                text: "Exceptional production quality! Can't wait for episode 2.",
                rating: 5,
                status: "approved",
                flagged: false,
                createdAt: "2026-03-30T14:20:00Z",
              },
              {
                id: "comment_2",
                contentTitle: "Apex Cinema Special",
                authorEmail: "spammer@example.com",
                text: "Click this link for free money http://spam.test",
                rating: 1,
                status: "pending",
                flagged: true,
                createdAt: "2026-03-31T09:12:00Z",
              },
            ],
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          const body = await parseBody(request, actionSchema);
          await fs.setDoc(`commentsQueue/${body.commentId}`, {
            status: body.action === "approve" ? "approved" : "hidden",
            moderatedAt: new Date().toISOString(),
            moderatedBy: user.email,
          });

          return Response.json({ success: true, action: body.action });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
