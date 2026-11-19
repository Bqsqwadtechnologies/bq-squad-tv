import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const reportSchema = z.object({
  targetType: z.enum(["comment", "content_asset", "channel", "user"]),
  targetId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(500),
  details: z.string().trim().max(2000).optional(),
});

export const Route = createFileRoute("/api/public/v1/content-reports/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const reports = await fs.query("userReports", {
            filters: [{ field: "reporterUid", op: "EQUAL", value: user.uid }],
            orderByField: "createdAt",
            descending: true,
            limit: 20,
          });

          return Response.json({
            reports: reports.map((r) => ({
              id: r.__id || r["id"],
              targetType: r["targetType"],
              targetId: r["targetId"],
              reason: r["reason"],
              status: r["status"] || "OPEN",
              createdAt: r["createdAt"] || null,
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, reportSchema);
          const fs = await Firestore.create();

          await enforceRateLimit(fs, "content-report:" + user.uid, {
            limit: 5,
            windowMs: 60 * 60_000,
          });

          const reportId = crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();

          const newReport = {
            reportId,
            reporterUid: user.uid,
            targetType: body.targetType,
            targetId: body.targetId,
            reason: body.reason,
            details: body.details || "",
            status: "OPEN",
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`userReports/${reportId}`, newReport, { mustNotExist: true });

          return Response.json(
            {
              ok: true,
              reportId,
              status: "OPEN",
              message: "Report received and queued for moderation review.",
            },
            { status: 201 },
          );
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
