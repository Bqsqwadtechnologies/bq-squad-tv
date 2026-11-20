import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const steps = [
  "upload",
  "process",
  "review",
  "publish",
  "watch",
  "comment",
  "check_numbers",
] as const;

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("SET_STEP"),
    step: z.enum(steps),
    status: z.enum(["pending", "complete", "blocked"]),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("IMPERSONATE_PREVIEW"),
    reason: z.string().trim().min(3).max(1000),
  }),
  z.object({
    action: z.literal("CLEANUP"),
    confirmation: z.literal(true),
    reason: z.string().trim().min(3).max(1000),
  }),
]);

const ownerKey = (uid: string) => `zillionaireTestLabOwners/${uid}`;

export const Route = createFileRoute("/api/public/v1/zillionaire/test-lab")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "video");
          const data = await fs.getDoc(ownerKey(user.uid));
          return Response.json(
            data || {
              active: false,
              steps: steps.map((id) => ({ id, status: "pending" })),
              testWalletMinor: 0,
            },
          );
        } catch (e) {
          return errorBody(e);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "video");
          const key = ownerKey(user.uid);
          const existing = await fs.getDoc(key);
          let after: Record<string, unknown>;

          if (body.action === "CREATE") {
            if (existing?.["active"] === true) {
              throw new ApiError(409, "TEST_LAB_ACTIVE", "The test lab is already active.");
            }
            const channelId = "test-" + crypto.randomUUID().replace(/-/g, "");
            const now = new Date().toISOString();
            after = {
              active: true,
              channelId,
              hidden: true,
              testOnly: true,
              testWalletMinor: 10000,
              currency: "NGN",
              createdAt: now,
              createdBy: user.uid,
              steps: steps.map((id) => ({ id, status: "pending" })),
            };
            await fs.setDoc(
              `channels/${channelId}`,
              {
                id: channelId,
                title: "Private Test Channel",
                channelType: "test",
                testOnly: true,
                ownerUid: user.uid,
                published: false,
                hidden: true,
                isLive: false,
                liveChatSettings: { enabled: false },
                createdAt: now,
              },
              { mustNotExist: true },
            );
            await fs.setDoc(
              `zillionaireTestLab/${channelId}`,
              {
                ownerUid: user.uid,
                testOnly: true,
                testWalletMinor: 10000,
                currency: "NGN",
                createdAt: now,
              },
              { mustNotExist: true },
            );
            await fs.setDoc(key, after);
          } else if (body.action === "SET_STEP") {
            if (!existing?.["active"] || existing["testOnly"] !== true) {
              throw new ApiError(
                404,
                "TEST_LAB_NOT_ACTIVE",
                "Create a test lab before updating its checklist.",
              );
            }
            const current = Array.isArray(existing["steps"])
              ? (existing["steps"] as Array<Record<string, unknown>>)
              : [];
            after = {
              ...existing,
              steps: current.map((item) =>
                item.id === body.step
                  ? { ...item, status: body.status, updatedAt: new Date().toISOString() }
                  : item,
              ),
            };
            await fs.setDoc(key, after);
          } else if (body.action === "IMPERSONATE_PREVIEW") {
            if (!existing?.["active"] || existing["testOnly"] !== true) {
              throw new ApiError(
                404,
                "TEST_LAB_NOT_ACTIVE",
                "Create a test lab before previewing it.",
              );
            }
            after = {
              channelId: existing["channelId"],
              mode: "read_only",
              createdAt: new Date().toISOString(),
            };
            await writeAuditLog(fs, {
              actorUid: user.uid,
              action: "test_lab.read_only_preview",
              targetType: "test_channel",
              targetId: String(existing["channelId"]),
              reason: body.reason,
              metadata: { readOnly: true, testOnly: true },
            });
            return Response.json(after);
          } else {
            if (body.confirmation !== true) {
              throw new ApiError(400, "CONFIRMATION_REQUIRED", "Confirm cleanup to continue.");
            }
            if (!existing?.["active"] || existing["testOnly"] !== true) {
              throw new ApiError(
                404,
                "TEST_LAB_NOT_ACTIVE",
                "There is no active test lab to clean up.",
              );
            }
            const channelId = String(existing["channelId"]);
            const channel = await fs.getDoc(`channels/${channelId}`);
            if (
              channel?.["testOnly"] !== true ||
              channel["ownerUid"] !== user.uid ||
              channel["published"] === true
            ) {
              throw new ApiError(
                409,
                "TEST_CHANNEL_NOT_SAFE_TO_DELETE",
                "Cleanup only removes an unpublished test-only channel.",
              );
            }
            await fs.deleteDoc(`zillionaireTestLab/${channelId}`);
            await fs.deleteDoc(`channels/${channelId}`);
            await fs.deleteDoc(key);
            after = { active: false, cleanedAt: new Date().toISOString() };
          }
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: `test_lab.${body.action.toLowerCase()}`,
            targetType: "test_lab",
            targetId: String(after.channelId || "current"),
            reason: body.reason,
            after: { testOnly: true, ...after },
          });
          return Response.json(after);
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
