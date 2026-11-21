import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";

const schema = z
  .object({
    category: z.enum(["billing", "playback", "account", "content", "verification", "other"]),
    ref: z.string().trim().max(100).optional(),
    kycCaseRef: z.string().trim().max(100).optional(),
    message: z.string().trim().min(5).max(2000),
    metadata: z.record(z.string(), z.any()).optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/support/tickets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const tickets = await fs.query("supportTickets", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
          });
          tickets.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
            String(b["createdAt"] ?? "").localeCompare(String(a["createdAt"] ?? "")),
          );
          return Response.json({ items: tickets });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const now = new Date().toISOString();
          const ticketId = `TCK-${Date.now().toString().slice(-6)}`;

          const ticket = {
            id: ticketId,
            uid: user.uid,
            email: user.email ?? "unknown",
            category: body.category,
            ref: body.ref ?? body.kycCaseRef ?? null,
            kycCaseRef: body.kycCaseRef ?? null,
            message: body.message,
            metadata: body.metadata ?? {},
            status: "open",
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`supportTickets/${ticketId}`, ticket);

          return Response.json({ ticket });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
