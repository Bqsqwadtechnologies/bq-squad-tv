import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import type { DurableOutboxRecord, OutboxItemStatus, NotificationEmailEventType } from "@/lib/server/email/outbox";

export const Route = createFileRoute("/api/public/v1/zillionaire/email/outbox/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          // Allowed for notifications, finance, or security operators
          await requireZillionaireModule(fs, user, "notifications");

          const url = new URL(request.url);
          const statusFilter = url.searchParams.get("status") as OutboxItemStatus | null;
          const eventTypeFilter = url.searchParams.get("eventType") as NotificationEmailEventType | null;
          const recipientFilter = url.searchParams.get("recipient")?.trim().toLowerCase();
          const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));

          // Query email_outbox collection
          const filters: Array<{ field: string; op: "EQUAL"; value: any }> = [];
          if (statusFilter) {
            filters.push({ field: "status", op: "EQUAL", value: statusFilter });
          }
          if (eventTypeFilter) {
            filters.push({ field: "eventType", op: "EQUAL", value: eventTypeFilter });
          }

          const rawDocs = await fs.query("email_outbox", {
            ...(filters.length > 0 ? { filters } : {}),
            limit: 200,
          }).catch(() => []);

          let items = rawDocs.map((doc) => doc as unknown as DurableOutboxRecord);

          if (recipientFilter) {
            items = items.filter((item) =>
              (item.recipientEmail || "").toLowerCase().includes(recipientFilter)
            );
          }

          // Sort newest first
          items.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

          const summary = {
            total: items.length,
            queued: items.filter((i) => i.status === "queued").length,
            sent: items.filter((i) => i.status === "sent").length,
            failed: items.filter((i) => i.status === "failed").length,
            retried: items.filter((i) => i.status === "retried").length,
          };

          const paginated = items.slice(0, limit);

          return Response.json({
            items: paginated,
            summary,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
