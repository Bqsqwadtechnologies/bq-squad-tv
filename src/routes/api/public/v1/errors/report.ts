import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";

const schema = z
  .object({
    ref: z.string().trim().min(3).max(20),
    note: z.string().trim().max(1000).optional(),
    email: z.string().trim().email().optional(),
  })
  .strict();

export const Route = createFileRoute("/api/public/v1/errors/report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          const now = new Date().toISOString();

          // Check if ref has an associated error fingerprint
          const refDoc = await fs.getDoc(`errorRefs/${body.ref}`);
          const fingerprint = (refDoc?.["fingerprint"] as string) ?? null;

          const reportId = `${body.ref}_${Date.now()}`;
          await fs.setDoc(`errorReports/${reportId}`, {
            id: reportId,
            ref: body.ref,
            fingerprint,
            note: body.note ?? "",
            email: body.email ?? "anonymous",
            createdAt: now,
            status: "new",
          });

          return Response.json({
            reported: true,
            ref: body.ref,
            message: "Thank you for reporting this issue. Our team has received your reference ID.",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
