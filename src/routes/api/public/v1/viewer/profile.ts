import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { ensureViewerUsername, isValidPublicUsername, normalizePublicUsername } from "@/lib/server/viewer-profile";
import { writeAuditLog } from "@/lib/server/audit";

const updateSchema = z.object({
  displayName: z.string().trim().min(2).max(50).optional(),
  username: z.string().trim().min(3).max(30).optional(),
}).strict();

export const Route = createFileRoute("/api/public/v1/viewer/profile")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const profile = await ensureViewerUsername(fs, user.uid);
          return Response.json({ profile }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
      PUT: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, updateSchema);
          const fs = await Firestore.create();
          const current = await ensureViewerUsername(fs, user.uid);
          const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

          if (body.displayName !== undefined) updates["displayName"] = body.displayName;

          if (body.username !== undefined) {
            const nextUsername = normalizePublicUsername(body.username);
            if (!isValidPublicUsername(nextUsername)) {
              throw new ApiError(400, "USERNAME_INVALID", "Use 3–30 lowercase letters, numbers, dots, underscores or hyphens. The first character must be a letter or number.");
            }
            if (nextUsername !== current.username) {
              const mappingPath = "usernames/" + nextUsername;
              const existing = await fs.getDoc(mappingPath);
              if (existing && existing["uid"] !== user.uid) {
                throw new ApiError(409, "USERNAME_TAKEN", "That username is already in use. Choose another one.");
              }
              if (!existing) {
                try {
                  await fs.setDoc(mappingPath, {
                    uid: user.uid,
                    kind: "viewer",
                    createdAt: new Date().toISOString(),
                  }, { mustNotExist: true });
                } catch (error) {
                  if (!(error instanceof ApiError) || error.status !== 409) throw error;
                  const raced = await fs.getDoc(mappingPath);
                  if (raced?.["uid"] !== user.uid) {
                    throw new ApiError(409, "USERNAME_TAKEN", "That username is already in use. Choose another one.");
                  }
                }
              }
              updates["username"] = nextUsername;
              updates["usernameUpdatedAt"] = new Date().toISOString();
              const oldMapping = await fs.getDoc("usernames/" + current.username);
              if (oldMapping?.["uid"] === user.uid) {
                await fs.deleteDoc("usernames/" + current.username).catch(() => undefined);
              }
            }
          }

          await fs.patchDoc("users/" + user.uid, updates);
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "viewer.public_profile_updated",
            targetType: "viewer",
            targetId: user.uid,
            reason: "Viewer updated their public display name or username",
            metadata: {
              changedDisplayName: body.displayName !== undefined,
              changedUsername: body.username !== undefined && normalizePublicUsername(body.username) !== current.username,
            },
          });
          const refreshed = await ensureViewerUsername(fs, user.uid);
          return Response.json({ success: true, profile: {
            ...refreshed,
            displayName: body.displayName ?? refreshed.displayName,
          } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
