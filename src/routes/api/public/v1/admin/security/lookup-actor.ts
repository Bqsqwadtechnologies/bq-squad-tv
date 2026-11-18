import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule, resolvePlatformAccess } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { getAuditHashKey, hmacSha256Hex } from "@/lib/server/access-denials";

const schema = z.object({
  actorHash: z.string().length(64),
  reason: z.string().trim().min(3).max(1000),
  stepUpConfirmed: z.boolean(),
}).strict();

export type ResolvedAccountInfo = {
  uid: string;
  email: string | null;
  roleTags: string[];
  createdAt: string | null;
};

export type LookupActorResponse = {
  found: boolean;
  account?: ResolvedAccountInfo;
  actorHash: string;
};

export const Route = createFileRoute("/api/public/v1/admin/security/lookup-actor")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();

          // Require Zillionaire security module permission
          await requireZillionaireModule(fs, user, "security");

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true,
          );

          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "OWNER_ONLY", "Only the verified platform owner can resolve security identities.");
          }

          if (!body.stepUpConfirmed) {
            throw new ApiError(403, "STEP_UP_REQUIRED", "Step-up verification is required before looking up account identity.");
          }

          await enforceRateLimit(fs, "admin-actor-lookup:" + user.uid, {
            limit: 10,
            windowMs: 60_000,
          });

          // Resolve matching user by hashing UIDs with audit key
          const key = getAuditHashKey();
          const users = await fs.query("users", { limit: 500 });
          let resolvedUser: ResolvedAccountInfo | null = null;

          for (const u of users) {
            const computed = await hmacSha256Hex(key, "uid:" + u.__id);
            if (computed.toLowerCase() === body.actorHash.toLowerCase()) {
              resolvedUser = {
                uid: u.__id,
                email: typeof u["email"] === "string" ? u["email"] : null,
                roleTags: Array.isArray(u["roleTags"])
                  ? u["roleTags"].filter((r): r is string => typeof r === "string")
                  : [],
                createdAt: typeof u["createdAt"] === "string" ? u["createdAt"] : null,
              };
              break;
            }
          }

          // Record tamper-evident chained audit entry
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "security.actor_lookup",
            targetType: "user",
            targetId: resolvedUser ? resolvedUser.uid : "unresolved",
            reason: body.reason,
            metadata: {
              actorHash: body.actorHash,
              resolved: Boolean(resolvedUser),
            },
          });

          const response: LookupActorResponse = {
            found: Boolean(resolvedUser),
            ...(resolvedUser ? { account: resolvedUser } : {}),
            actorHash: body.actorHash,
          };

          return Response.json(response, {
            headers: { "cache-control": "no-store" },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
