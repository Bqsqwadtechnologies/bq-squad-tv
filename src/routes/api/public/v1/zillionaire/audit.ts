import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const sensitiveKey = /(secret|token|password|credential|authorization|private.?key|signed.?url)/i;

function safeMetadata(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeMetadata(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return value.length > 500 ? value.slice(0, 500) + "…" : value;
    return value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !sensitiveKey.test(key))
      .slice(0, 40)
      .map(([key, item]) => [key, safeMetadata(item, depth + 1)]),
  );
}

export const Route = createFileRoute("/api/public/v1/zillionaire/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-audit-read:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const url = new URL(request.url);
          const actionFilter = url.searchParams.get("action");
          const targetTypeFilter = url.searchParams.get("targetType");
          const actorUidFilter = url.searchParams.get("actorUid");
          const limit = Math.min(200, Math.max(10, Number(url.searchParams.get("limit") || 100)));

          const filters: Array<{ field: string; op: "EQUAL"; value: unknown }> = [];
          if (actionFilter) filters.push({ field: "action", op: "EQUAL", value: actionFilter });
          if (targetTypeFilter) filters.push({ field: "targetType", op: "EQUAL", value: targetTypeFilter });
          if (actorUidFilter) filters.push({ field: "actorUid", op: "EQUAL", value: actorUidFilter });

          const rows = await fs.query("auditLog", {
            ...(filters.length > 0 ? { filters } : {}),
            orderByField: "createdAt",
            descending: true,
            limit,
          }).catch(() => []);

          return Response.json(
            {
              entries: rows.map((row) => ({
                id: row.__id,
                actorUid: typeof row["actorUid"] === "string" ? row["actorUid"] : null,
                action: typeof row["action"] === "string" ? row["action"] : "unknown",
                targetType: typeof row["targetType"] === "string" ? row["targetType"] : null,
                targetId: typeof row["targetId"] === "string" ? row["targetId"] : null,
                reason: typeof row["reason"] === "string" ? row["reason"].slice(0, 1000) : "",
                metadata: safeMetadata(row["metadata"]),
                createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : new Date().toISOString(),
              })),
            },
            { headers: { "cache-control": "private, no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
