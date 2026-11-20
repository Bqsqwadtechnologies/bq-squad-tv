import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAuthorizedChannelUpload } from "@/lib/server/producer-upload-access";
import { requireZillionaireModule } from "@/lib/server/roles";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const allowedTypes = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export const Route = createFileRoute("/api/public/v1/content-assets/$assetId/rights-evidence")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const user = await requireUser(request);
          if (!/^[A-Za-z0-9_-]{1,100}$/.test(params.assetId))
            throw new ApiError(400, "ASSET_ID_INVALID", "The video could not be found.");
          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File))
            throw new ApiError(400, "RIGHTS_EVIDENCE_REQUIRED", "Choose a PDF, PNG or JPEG rights document.");
          if (file.size < 1 || file.size > MAX_EVIDENCE_BYTES)
            throw new ApiError(413, "RIGHTS_EVIDENCE_SIZE_INVALID", "Rights documents must be 10 MB or smaller.");
          const extension = allowedTypes.get(file.type);
          if (!extension)
            throw new ApiError(415, "RIGHTS_EVIDENCE_TYPE_INVALID", "Rights documents must be PDF, PNG or JPEG files.");
          const fs = await Firestore.create();
          const asset = await fs.getDoc("contentAssets/" + params.assetId);
          if (!asset || asset["ownerUid"] !== user.uid)
            throw new ApiError(404, "ASSET_NOT_FOUND", "The video could not be found.");
          const channelId = typeof asset["channelId"] === "string" ? asset["channelId"] : "";
          if (!/^[A-Za-z0-9_-]{1,80}$/.test(channelId))
            throw new ApiError(409, "CHANNEL_ID_INVALID", "The channel for this upload is invalid.");
          try {
            await requireAuthorizedChannelUpload(fs, channelId, user);
          } catch {
            await requireZillionaireModule(fs, user, "content");
          }
          const path = `producers/${user.uid}/${channelId}/${params.assetId}/rights/${crypto.randomUUID()}.${extension}`;
          if (!isSafeStoragePath(path))
            throw new ApiError(400, "RIGHTS_EVIDENCE_PATH_INVALID", "The rights document could not be stored safely.");
          const { error } = await supabaseAdmin.storage.from("bq-sqwad-source-media").upload(path, await file.arrayBuffer(), {
            contentType: file.type,
            upsert: false,
          });
          if (error)
            throw new ApiError(503, "RIGHTS_EVIDENCE_UPLOAD_FAILED", "The private rights document could not be stored.");
          const now = new Date().toISOString();
          const existingLicense = asset["license"] && typeof asset["license"] === "object"
            ? asset["license"] as Record<string, unknown>
            : {};
          await fs.patchDoc("contentAssets/" + params.assetId, {
            rightsEvidencePath: path,
            license: {
              ...existingLicense,
              evidencePath: path,
              status: "pending",
              verificationStatus: "pending",
              licenseType: asset["licenseType"] || "owned",
              copyrightHolderName: asset["copyrightHolderName"] || "",
              submittedBy: user.uid,
              submittedAt: now,
            },
            updatedAt: now,
          });
          return Response.json({ assetId: params.assetId, rightsEvidencePath: path, storedPrivately: true });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
