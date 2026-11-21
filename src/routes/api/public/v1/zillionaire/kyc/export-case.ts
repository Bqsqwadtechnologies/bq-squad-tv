import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser, parseBody } from "@/lib/server/api";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { requireStepUp } from "@/lib/server/zillionaire-access";
import { writeAuditLog } from "@/lib/server/audit";
import { getKycProfile } from "@/lib/server/kyc/persistence";
import { renderKycCaseDossierHtml } from "@/lib/server/kyc/case-dossier";

const exportSchema = z.object({
  uid: z.string().trim().min(1),
  reason: z.string().trim().min(10).max(1000),
  includeAuditTrail: z.boolean().default(true),
  format: z.enum(["json", "pdf"]).default("json"),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/kyc/export-case")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const access = await resolvePlatformAccess(
            fs,
            user.uid,
            user.email,
            user.customClaims,
            user.emailVerified === true,
          );

          if (!access.isZillionaireOwner) {
            throw new ApiError(
              403,
              "OWNER_AUTHORITY_REQUIRED",
              "Only the verified platform owner can export complete KYC case files.",
            );
          }

          // Strict step-up re-authentication required for case file export
          requireStepUp(request, user.uid, "kyc_case_export");

          const body = await parseBody(request, exportSchema);

          const profile = await getKycProfile(fs, body.uid, { decryptSensitive: true });
          if (!profile) {
            throw new ApiError(404, "PROFILE_NOT_FOUND", "Target KYC profile not found.");
          }

          let auditEvents: any[] = [];
          if (body.includeAuditTrail) {
            const allAudits = await fs.query("auditLogs", { limit: 500 }).catch(() => []);
            auditEvents = allAudits.filter(
              (a: any) => a["targetId"] === body.uid || a["metadata"]?.["applicantUid"] === body.uid,
            );
          }

          const exportTimestamp = new Date().toISOString();

          // Write mandatory audit log entry for case export
          await writeAuditLog(fs, {
            action: "kyc.case_file_exported",
            actorUid: user.uid,
            actorEmail: user.email || "",
            targetType: "kyc_case",
            targetId: body.uid,
            reason: body.reason,
            metadata: {
              applicantUid: body.uid,
              exportTimestamp,
              format: body.format,
              auditsIncluded: auditEvents.length,
            },
          });

          if (body.format === "pdf") {
            const html = renderKycCaseDossierHtml({
              profile,
              audits: auditEvents,
              exportedBy: user.uid,
              exportedAt: exportTimestamp,
              legalReason: body.reason,
            });

            return new Response(html, {
              headers: {
                "content-type": "text/html; charset=utf-8",
                "content-disposition": `inline; filename="KYC_DOSSIER_${profile.uid}.html"`,
                "x-case-file-type": "official_pdf_dossier",
              },
            });
          }

          return Response.json({
            ok: true,
            caseFile: {
              exportMetadata: {
                exportedBy: user.uid,
                exportedAt: exportTimestamp,
                legalReason: body.reason,
                formatVersion: "1.0",
              },
              applicantProfile: profile,
              auditHistory: auditEvents,
            },
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
