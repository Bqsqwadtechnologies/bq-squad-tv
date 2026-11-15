import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  approved: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
});

export const Route = createFileRoute("/api/public/v1/admin/producers/$uid/verification")({
  server: { handlers: { POST: async ({ request, params }) => {
    try {
      const reviewer = await requireUser(request);
      const body = await parseBody(request, schema);
      const uid = params.uid;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw new ApiError(400, "USER_ID_INVALID", "The producer identifier is invalid.");
      if (uid === reviewer.uid) throw new ApiError(403, "INDEPENDENT_REVIEW_REQUIRED", "You cannot review your own producer verification.");
      const fs = await Firestore.create();
      await requireAdminModule(fs, reviewer, "producers");
      const producer = await fs.getDoc("producers/" + uid);
      if (!producer || producer["verificationStatus"] !== "PENDING") {
        throw new ApiError(404, "PENDING_VERIFICATION_NOT_FOUND", "No pending producer verification exists for this account.");
      }
      if (producer["verificationSubmittedBy"] === reviewer.uid) {
        throw new ApiError(403, "INDEPENDENT_REVIEW_REQUIRED", "A different authorized reviewer must review this submission.");
      }
      const paths = Array.isArray(producer["evidencePaths"])
        ? producer["evidencePaths"].filter((path): path is string => typeof path === "string")
        : [];
      if (paths.length === 0) throw new ApiError(409, "VERIFICATION_EVIDENCE_MISSING", "The producer verification has no evidence documents.");
      if (body.approved) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        for (const path of paths) {
          const { data, error } = await supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(path, 60);
          if (error || !data?.signedUrl) throw new ApiError(409, "VERIFICATION_EVIDENCE_UNAVAILABLE", "One or more verification documents are no longer available.");
        }
      }
      const now = new Date().toISOString();
      const status = body.approved ? "APPROVED" : "REJECTED";
      await fs.patchDoc("producers/" + uid, {
        verificationStatus: status,
        verificationReviewedAt: now,
        verificationReviewedBy: reviewer.uid,
        verificationReviewReason: body.reason,
      });
      await writeAuditLog(fs, {
        actorUid: reviewer.uid,
        action: body.approved ? "producer.verification_approved" : "producer.verification_rejected",
        targetType: "producer",
        targetId: uid,
        reason: body.reason,
        metadata: { evidenceCount: paths.length },
      });
      return Response.json({ uid, verificationStatus: status, reviewedAt: now });
    } catch (error) { return errorBody(error); }
  } } },
});
