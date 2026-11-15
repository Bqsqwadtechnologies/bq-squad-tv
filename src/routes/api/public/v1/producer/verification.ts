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
  evidenceUploadIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{20,64}$/)).min(1).max(5),
  declarationAccepted: z.literal(true),
}).superRefine((value, context) => {
  if (new Set(value.evidenceUploadIds).size !== value.evidenceUploadIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceUploadIds"], message: "Evidence uploads must be unique." });
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
      const uploads = await Promise.all(body.evidenceUploadIds.map(uploadId =>
        fs.getDoc("producerVerificationUploads/" + uploadId),
      ));
      if (uploads.some(upload => !upload || upload["uid"] !== user.uid || upload["status"] !== "awaiting_upload")) {
        throw new ApiError(400, "VERIFICATION_UPLOAD_INVALID", "One or more verification uploads are invalid or already attached.");
      }
      const nowMs = Date.now();
      const paths = uploads.map(upload => typeof upload?.["path"] === "string" ? upload["path"] : "");
      if (paths.some(path => !isSafeStoragePath(path) || !path.startsWith("producer-verification/" + user.uid + "/"))) {
        throw new ApiError(400, "VERIFICATION_EVIDENCE_PATH_INVALID", "Evidence must be uploaded to your private producer-verification folder.");
      }
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index]!;
        const expiry = typeof upload["expiresAt"] === "string" ? Date.parse(upload["expiresAt"]) : 0;
        if (!Number.isFinite(expiry) || nowMs >= expiry) {
          throw new ApiError(410, "VERIFICATION_UPLOAD_EXPIRED", "One or more verification upload sessions have expired.");
        }
        const path = paths[index]!;
        const { data, error } = await supabaseAdmin.storage.from("bq-sqwad-source-media").createSignedUrl(path, 60);
        if (error || !data?.signedUrl) {
          throw new ApiError(400, "VERIFICATION_EVIDENCE_NOT_FOUND", "One or more private verification documents could not be found.");
        }
        const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-511" } });
        if (response.status !== 206) throw new ApiError(502, "VERIFICATION_EVIDENCE_RANGE_UNSUPPORTED", "Private storage did not honor the bounded evidence inspection request.");
        const header = new Uint8Array(await response.arrayBuffer());
        const range = response.headers.get("content-range");
        const totalMatch = range?.match(/\\/(\\d+)$/);
        const actualSize = totalMatch?.[1] ? Number(totalMatch[1]) : NaN;
        if (!Number.isSafeInteger(actualSize) || actualSize !== upload["declaredSizeBytes"]) {
          throw new ApiError(400, "VERIFICATION_EVIDENCE_SIZE_MISMATCH", "A verification document does not match its declared size.");
        }
        const mime = upload["mimeType"];
        const validSignature =
          (mime === "application/pdf" && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46) ||
          (mime === "image/jpeg" && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) ||
          (mime === "image/png" && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47) ||
          (mime === "image/webp" && new TextDecoder().decode(header.slice(0, 4)) === "RIFF" && new TextDecoder().decode(header.slice(8, 12)) === "WEBP");
        if (!validSignature) throw new ApiError(415, "VERIFICATION_EVIDENCE_TYPE_INVALID", "A verification document's file signature does not match its declared type.");
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
        evidencePaths: paths,
        declarationAccepted: true,
        declarationAcceptedAt: now,
        verificationSubmittedAt: now,
        verificationSubmittedBy: user.uid,
        verificationReviewedAt: null,
        verificationReviewedBy: null,
        verificationReviewReason: null,
      });
      for (const uploadId of body.evidenceUploadIds) {
        await fs.patchDoc("producerVerificationUploads/" + uploadId, { status: "attached", attachedAt: now });
      }
      await writeAuditLog(fs, {
        actorUid: user.uid,
        action: "producer.verification_submitted",
        targetType: "producer",
        targetId: user.uid,
        reason: "Producer submitted identity, legal-entity and rights-holder verification evidence",
        metadata: { countryCode: body.countryCode, entityType: body.entityType, evidenceCount: paths.length },
      });
      return Response.json({ verificationStatus: "PENDING", submittedAt: now }, { status: 202 });
    } catch (error) { return errorBody(error); }
  } } },
});
