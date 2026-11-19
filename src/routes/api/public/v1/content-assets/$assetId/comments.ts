import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import {
  errorBody,
  getUserProfile,
  parseBody,
  requireAdultForContent,
  requireUser,
} from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { recordRiskSignal } from "@/lib/server/risk-engine";

const schema = z.object({ body: z.string().trim().min(2).max(1500) });

export const Route = createFileRoute("/api/public/v1/content-assets/$assetId/comments")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
          const fs = await Firestore.create();
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["status"] !== "ready" || asset["contentStatus"] !== "published") {
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This published content is not available.",
            );
          }
          const channel =
            typeof asset["channelId"] === "string"
              ? await fs.getDoc("channels/" + asset["channelId"])
              : null;
          if (!channel || channel["published"] !== true)
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This content's channel is not published.",
            );
          requireAdultForContent(await getUserProfile(fs, user.uid), channel["adultOnly"]);
          const comments = await fs.query("contentComments", {
            filters: [
              { field: "assetId", op: "EQUAL", value: assetId },
              { field: "status", op: "EQUAL", value: "APPROVED" },
            ],
            orderByField: "createdAt",
            descending: true,
            limit: 50,
          });
          return Response.json(
            comments.map((comment) => ({
              id: comment.__id,
              body: comment["body"] ?? "",
              viewerNumber: comment["viewerNumber"] ?? "Viewer",
              createdAt: comment["createdAt"] ?? null,
            })),
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, schema);
          const assetId = params.assetId;
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The content identifier is invalid.");
          const normalizedBody = Array.from(body.body)
            .filter((character) => {
              const code = character.charCodeAt(0);
              return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
            })
            .join("")
            .trim();
          if (normalizedBody.length < 2)
            throw new ApiError(400, "COMMENT_INVALID", "The comment must contain readable text.");
          const fs = await Firestore.create();
          await enforceRateLimit(fs, "content-comment:" + user.uid, {
            limit: 5,
            windowMs: 60 * 60_000,
          });
          const asset = await fs.getDoc("contentAssets/" + assetId);
          if (!asset || asset["status"] !== "ready" || asset["contentStatus"] !== "published") {
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This published content is not available for commenting.",
            );
          }
          const channel =
            typeof asset["channelId"] === "string"
              ? await fs.getDoc("channels/" + asset["channelId"])
              : null;
          if (!channel || channel["published"] !== true)
            throw new ApiError(
              404,
              "CONTENT_NOT_AVAILABLE",
              "This content's channel is not published.",
            );
          requireAdultForContent(await getUserProfile(fs, user.uid), channel["adultOnly"]);
          const profile = await fs.getDoc("users/" + user.uid);
          const viewerNumber =
            typeof profile?.["userNumber"] === "string" &&
            /^[0-9]{6,20}$/.test(profile["userNumber"])
              ? profile["userNumber"]
              : "Viewer";
          const commentId = crypto.randomUUID().replace(/-/g, "");
          const now = new Date().toISOString();
          await fs.setDoc(
            "contentComments/" + commentId,
            {
              assetId,
              authorUid: user.uid,
              viewerNumber,
              body: normalizedBody,
              status: "PENDING",
              createdAt: now,
              updatedAt: now,
            },
            { mustNotExist: true },
          );
          await recordRiskSignal(fs, user.uid, "comment_burst");
          return Response.json(
            { commentId, status: "PENDING", message: "Your comment was submitted for moderation." },
            { status: 202 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
