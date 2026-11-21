import { reviewKycProfile } from "@/lib/server/kyc/persistence";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

const schema = z
  .object({
    approved: z.boolean().optional(),
    action: z.enum(["approve", "reject", "request_evidence", "suspend", "revoke"]).optional(),
    reason: z.string().trim().min(3).max(1000),
  })
  .refine((value) => value.action !== undefined || value.approved !== undefined, {
    message: "Choose a verification review action.",
  });

export const Route = createFileRoute("/api/public/v1/zillionaire/producers/$uid/verification")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const reviewer = await requireUser(request);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
            throw new ApiError(400, "USER_ID_INVALID", "The producer identifier is invalid.");
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, reviewer, "producers");
          const producer = await fs.getDoc("producers/" + uid);
          if (!producer)
            throw new ApiError(
              404,
              "PRODUCER_NOT_FOUND",
              "The producer verification record was not found.",
            );
          const paths = Array.isArray(producer["evidencePaths"])
            ? producer["evidencePaths"].filter((path): path is string => typeof path === "string")
            : [];
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const evidence = await Promise.all(
            paths.map(async (path) => {
              const { data, error } = await supabaseAdmin.storage
                .from("bq-sqwad-source-media")
                .createSignedUrl(path, 60);
              return !error && data?.signedUrl
                ? { url: data.signedUrl, expiresInSeconds: 60 }
                : null;
            }),
          );
          const reviews = await fs.query("producerVerificationReviews", {
            filters: [{ field: "producerUid", op: "EQUAL", value: uid }],
            orderByField: "createdAt",
            descending: true,
            limit: 30,
          });
          await writeAuditLog(fs, {
            actorUid: reviewer.uid,
            action: "producer.verification_evidence_viewed",
            targetType: "producer",
            targetId: uid,
            reason: "Authorized reviewer accessed producer verification evidence",
            metadata: { evidenceCount: paths.length },
          });
          return Response.json(
            {
              producer: {
                uid,
                legalName: producer["legalName"] ?? null,
                businessName: producer["businessName"] ?? null,
                countryCode: producer["countryCode"] ?? null,
                entityType: producer["entityType"] ?? null,
                verificationStatus: producer["verificationStatus"] ?? "NOT_SUBMITTED",
                submittedAt: producer["verificationSubmittedAt"] ?? null,
                reviewedAt: producer["verificationReviewedAt"] ?? null,
                reviewedBy: producer["verificationReviewedBy"] ?? null,
                reviewReason: producer["verificationReviewReason"] ?? null,
              },
              evidence: evidence.filter(
                (item): item is { url: string; expiresInSeconds: number } => item !== null,
              ),
              reviewHistory: reviews.map((item) => ({
                id: item.__id,
                action: item["action"] ?? null,
                fromStatus: item["fromStatus"] ?? null,
                toStatus: item["toStatus"] ?? null,
                reason: item["reason"] ?? null,
                reviewerUid: item["reviewerUid"] ?? null,
                createdAt: item["createdAt"] ?? null,
              })),
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request, params }) => {
        try {
          const reviewer = await requireUser(request);
          const body = await parseBody(request, schema);
          const uid = params.uid;
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid))
            throw new ApiError(400, "USER_ID_INVALID", "The producer identifier is invalid.");
          if (uid === reviewer.uid)
            throw new ApiError(
              403,
              "INDEPENDENT_REVIEW_REQUIRED",
              "You cannot review your own producer verification.",
            );
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, reviewer, "producers");
          const producer = await fs.getDoc("producers/" + uid);
          if (!producer)
            throw new ApiError(404, "PRODUCER_NOT_FOUND", "The producer account was not found.");
          if (producer["verificationSubmittedBy"] === reviewer.uid) {
            throw new ApiError(
              403,
              "INDEPENDENT_REVIEW_REQUIRED",
              "A different authorized reviewer must review this submission.",
            );
          }
          const action = body.action ?? (body.approved ? "approve" : "reject");
          const currentStatus =
            typeof producer["verificationStatus"] === "string"
              ? producer["verificationStatus"]
              : "NOT_SUBMITTED";
          const allowedFrom: Record<string, string[]> = {
            approve: ["PENDING", "NEEDS_MORE_EVIDENCE"],
            reject: ["PENDING", "NEEDS_MORE_EVIDENCE"],
            request_evidence: ["PENDING", "NEEDS_MORE_EVIDENCE"],
            suspend: ["APPROVED"],
            revoke: ["APPROVED", "SUSPENDED"],
          };
          if (!allowedFrom[action]?.includes(currentStatus)) {
            throw new ApiError(
              409,
              "VERIFICATION_STATE_CONFLICT",
              "This verification record cannot receive that review action in its current state.",
            );
          }
          const paths = Array.isArray(producer["evidencePaths"])
            ? producer["evidencePaths"].filter((path): path is string => typeof path === "string")
            : [];
          if (["approve", "request_evidence"].includes(action) && paths.length === 0) {
            throw new ApiError(
              409,
              "VERIFICATION_EVIDENCE_MISSING",
              "The producer verification has no evidence documents.",
            );
          }
          if (action === "approve") {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            for (const path of paths) {
              const { data, error } = await supabaseAdmin.storage
                .from("bq-sqwad-source-media")
                .createSignedUrl(path, 60);
              if (error || !data?.signedUrl)
                throw new ApiError(
                  409,
                  "VERIFICATION_EVIDENCE_UNAVAILABLE",
                  "One or more verification documents are no longer available.",
                );
            }
          }
          const nextStatus = (
            {
              approve: "APPROVED",
              reject: "REJECTED",
              request_evidence: "NEEDS_MORE_EVIDENCE",
              suspend: "SUSPENDED",
              revoke: "REVOKED",
            } as const
          )[action];
          const now = new Date().toISOString();
          await fs.patchDoc("producers/" + uid, {
            verificationStatus: nextStatus,
            verificationReviewedAt: now,
            verificationReviewedBy: reviewer.uid,
            verificationReviewReason: body.reason,
            verificationLastAction: action,
          });
          await fs.setDoc(
            "producerVerificationReviews/" + crypto.randomUUID().replace(/-/g, ""),
            {
              producerUid: uid,
              reviewerUid: reviewer.uid,
              action,
              fromStatus: currentStatus,
              toStatus: nextStatus,
              reason: body.reason,
              evidenceCount: paths.length,
              createdAt: now,
            },
            { mustNotExist: true },
          );
          await writeAuditLog(fs, {
            actorUid: reviewer.uid,
            action: "producer.verification_" + action,
            targetType: "producer",
            targetId: uid,
            reason: body.reason,
            metadata: {
              evidenceCount: paths.length,
              fromStatus: currentStatus,
              toStatus: nextStatus,
            },
          });
          if (nextStatus === "APPROVED" || nextStatus === "REJECTED") {
            await reviewKycProfile(fs, {
              uid,
              reviewerUid: reviewer.uid,
              status: nextStatus === "APPROVED" ? "approved" : "rejected",
              reason: body.reason,
              notes: "Producer verification review action: " + action,
            }).catch((err) => {
              console.warn("[KYC] Profile review mirror warning:", err);
            });
          }

          return Response.json({ uid, verificationStatus: nextStatus, action, reviewedAt: now });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
