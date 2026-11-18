import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/support/messages")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "support");

        const messages = await fs.listCollection("supportMessages", { limit: 100 });
        return Response.json({
          messages: messages.map(m => ({
            id: m["id"] || m["messageId"],
            name: m["name"] || "Visitor",
            email: m["email"] || "",
            subject: m["subject"] || "Inquiry",
            message: m["message"] || "",
            status: m["status"] || "new", // new, in_progress, resolved
            notes: m["notes"] || "",
            createdAt: m["createdAt"] || null,
          })),
        });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
    POST: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "support");

        const body = await request.json() as { messageId?: string; status?: string; notes?: string };
        if (!body.messageId) {
          return Response.json({ error: "messageId is required" }, { status: 400 });
        }

        await fs.updateDoc(`supportMessages/${body.messageId}`, {
          ...(body.status ? { status: body.status } : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
          updatedAt: new Date().toISOString(),
          updatedByUid: user.uid,
        });

        return Response.json({ ok: true, messageId: body.messageId });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
