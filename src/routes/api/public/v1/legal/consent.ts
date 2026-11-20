import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { getWebSessionUser } from "@/lib/server/web-session";

const ConsentSchema = z.object({
  essential: z.literal(true),
  analytics: z.boolean(),
  marketing: z.boolean(),
  version: z.string().min(1).max(20).default("1.0"),
});

export const Route = createFileRoute("/api/public/v1/legal/consent")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await parseBody(request, ConsentSchema);
          const user = await getWebSessionUser(request);
          const fs = await Firestore.create();

          const nowIso = new Date().toISOString();
          const uid = user?.uid ?? "anonymous";
          const clientIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
          const userAgent = request.headers.get("user-agent") || "unknown";

          const consentId = `consent_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          await fs.setDoc(`consentRecords/${consentId}`, {
            uid,
            essential: body.essential,
            analytics: body.analytics,
            marketing: body.marketing,
            version: body.version,
            userAgent: userAgent.slice(0, 200),
            maskedIp: clientIp !== "unknown" ? `${clientIp.split(".")[0]}.***.***` : "unknown",
            createdAt: nowIso,
          });

          return Response.json({
            ok: true,
            recordedAt: nowIso,
            consentId,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
