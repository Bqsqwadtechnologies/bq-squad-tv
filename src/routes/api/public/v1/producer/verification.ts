import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { isSafeStoragePath } from "@/lib/server/storage/security";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z.object({
  legalName: z.string().trim().min(3).max(160),
  businessName: z.string().trim().max(160).optional(),
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  entityType: z.enum(["individual", "registered_business", "company", "rights_holder"]),
  evidencePaths: z.array(z.string().min(1).max(1024)).min(1).max(5),
  declarationAccepted: z.literal(true),
}).superRefine((value, context) => {
  if (new Set(value.evidencePaths).size !== value.evidencePaths.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidencePaths"], message: "Evidence files must be unique." });
  }
});

export const Route = createFileRoute("/api/public/v1/producer/verification")({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const user = await requireUser(request);
      if (!user.emailVerified) throw new ApiError(403, "EMAIL_VERIFICATION_REQUIRED", "Verify your email before submitting producer verification.");
      const body = await parseBody(request, schema);
      const fs = await Firestore.create();
      await enforceRateLimit(fs, "producer-verification:" + user.uid, { limit: 3, windowMs: 24 * 60 * 60_000 });
      const existing = await fs.getDoc("producers/" + user.uid);
      if (existing?.["verificationStatus"] === "APPROVED") {
        throw new ApiError(409, "PRODUCER_ALREADY_VERIFIED", "This producer account is already verified.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const prefix = "producer-verification/" + user.uid + "/";
      for (const path of body.evidencePaths) {
        if (!isSafeStoragePath(path) || !path.startsWith(prefix)) {
          throw new ApiError(400, "VERIFICATION_EVIDENCE_PATH_INVALID", "Evidence must be uploaded to your private producer-verification folder.");
        }
        const { data, error } = await supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(path, 60);
        if (error || !data?.signedUrl) {
          throw new ApiError(400, "VERIFICATION_EVIDENCE_NOT_FOUND", "One or more private verification documents could not be found.");
        }
      }
      const now = new Date().toISOString();
      const currentStatus = existing?.["verificationStatus"];
      if (currentStatus === "PENDING") throw new ApiError(409, "VERIFICATION_ALREADY_PENDING", "Your producer verification is already awaiting review.");
      await fs.patchDoc("producers/" + user.uid, {
        verificationStatus: "PENDING",
        legalName: body.legalName,
        businessName: body.businessName ?? null,
        countryCode: body.countryCode,
        entityType: body.entityType,
        evidencePaths: body.evidencePaths,
        declarationAccepted: true,
        declarationAcceptedAt: now,
        verificationSubmittedAt: now,
        verificationSubmittedBy: user.uid,
        verificationReviewedAt: null,
        verificationReviewedBy: null,
        verificationReviewReason: null,
      });
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "producer.verification_submitted",
        targetType: "producer",
        targetId: user.uid,
        reason: "Producer submitted identity, legal-entity and rights-holder verification evidence",
        metadata: { countryCode: body.countryCode, entityType: body.entityType, evidenceCount: body.evidencePaths.length },
      });
      return Response.json({ verificationStatus: "PENDING", submittedAt: now }, { status: 202 });
    } catch (error) { return errorBody(error); }
  } } },
});
