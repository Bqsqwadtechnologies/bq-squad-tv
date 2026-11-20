import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import {
  checkReputation,
  listReputationEntries,
  removeReputationEntry,
  setReputationEntry,
  type ReputationStatus,
  type ReputationTargetType,
} from "@/lib/server/abuse-protection";

const setSchema = z
  .object({
    targetType: z.enum(["ip", "device"]),
    targetValue: z.string().trim().min(1).max(200),
    status: z.enum(["allowed", "greylisted", "blacklisted"]),
    reason: z.string().trim().min(3).max(1000),
    riskScore: z.number().int().min(0).max(100).optional(),
    ttlHours: z.number().int().min(1).max(8760).optional(),
  })
  .strict();

const deleteSchema = z
  .object({
    entryId: z.string().trim().min(1).max(200),
    reason: z.string().trim().min(3).max(1000),
  })
  .strict();

// createFileRoute("/api/public/v1/zillionaire/security/reputation")
export const Route = createFileRoute("/api/public/v1/zillionaire/security/reputation")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-reputation:" + user.uid, {
            limit: 60,
            windowMs: 60_000,
          });

          const url = new URL(request.url);
          const targetType = url.searchParams.get("targetType") as ReputationTargetType | null;
          const status = url.searchParams.get("status") as ReputationStatus | null;
          const rawLimit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
          const limit = Number.isSafeInteger(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 100;

          const entries = await listReputationEntries(fs, {
            ...(targetType ? { targetType } : {}),
            ...(status ? { status } : {}),
            limit,
          });

          return Response.json({ entries }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, setSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-reputation-write:" + user.uid, {
            limit: 30,
            windowMs: 60_000,
          });

          const entry = await setReputationEntry(fs, {
            targetType: body.targetType,
            targetValue: body.targetValue,
            status: body.status,
            reason: body.reason,
            ...(typeof body.riskScore === "number" ? { riskScore: body.riskScore } : {}),
            ...(typeof body.ttlHours === "number" ? { ttlHours: body.ttlHours } : {}),
            actorUid: user.uid,
          });

          return Response.json({ entry }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      DELETE: async ({ request }: { request: Request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, deleteSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");
          await enforceRateLimit(fs, "zillionaire-reputation-delete:" + user.uid, {
            limit: 30,
            windowMs: 60_000,
          });

          await removeReputationEntry(fs, body.entryId, user.uid, body.reason);
          return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
