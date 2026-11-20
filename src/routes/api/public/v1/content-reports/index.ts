import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";

const reportSchema = z.object({
  targetType: z.enum(["comment", "content_asset", "channel", "user"]),
  targetId: z.string().trim().min(1).max(100),
  reason: z.string().trim().min(3).max(500),
  details: z.string().trim().max(2000).optional(),
  reporterName: z.string().trim().min(2).max(160).optional(),
  reporterEmail: z.string().trim().email().max(254).optional(),
  rightsHolderName: z.string().trim().min(2).max(160).optional(),
  rightsHolderEmail: z.string().trim().email().max(254).optional(),
  rightsBasis: z.string().trim().min(10).max(3000).optional(),
  declaration: z.literal(true).optional(),
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
          const user = await requireUser(request).catch(() => null);
          const body = await parseBody(request, reportSchema);
          if (
            !user &&
            (!body.reporterName || !body.reporterEmail || !body.rightsHolderName ||
              !body.rightsHolderEmail || !body.rightsBasis || body.declaration !== true ||
              body.targetType !== "content_asset")
          ) {
            throw new ApiError(400, "COPYRIGHT_REPORT_DETAILS_REQUIRED", "A public copyright report requires reporter contact details, rights-holder details, the basis of the claim and confirmation that the information is accurate.");
          }
          const fs = await Firestore.create();
          const rateIdentity = user?.uid || body.reporterEmail?.trim().toLowerCase() || "anonymous";
          const rateDigest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rateIdentity));
          const rateKey = Array.from(new Uint8Array(rateDigest), (value) => value.toString(16).padStart(2, "0")).join("");

          await enforceRateLimit(fs, "content-report:" + rateKey, {
            limit: 3,
            windowMs: 60 * 60_000,
          });

          const reportId = crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();

          const newReport = {
            reportId,
            reporterUid: user?.uid ?? null,
            reporterName: body.reporterName || "",
            reporterEmail: body.reporterEmail || "",
            rightsHolderName: body.rightsHolderName || "",
            rightsHolderEmail: body.rightsHolderEmail || "",
            rightsBasis: body.rightsBasis || "",
            declaration: body.declaration === true,
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
