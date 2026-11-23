import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/producers/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "producers");

          const url = new URL(request.url);
          const q = url.searchParams.get("q")?.toLowerCase().trim();
          const status = url.searchParams.get("status")?.toUpperCase().trim();

          const producers = await fs.query("producers", { limit: 100 });

          let mapped = producers.map((p) => {
            const uid = String(p.__id || p["id"] || p["uid"] || "");
            return {
              id: uid,
              displayName: String(p["displayName"] || p["legalName"] || "Producer"),
              username: String(p["slug"] || p["publicId"] || ""),
              companyName: String(p["companyName"] || p["businessName"] || ""),
              legalName: String(p["legalName"] || ""),
              countryCode: String(p["countryCode"] || "NG"),
              entityType: String(p["entityType"] || "individual"),
              planStatus: String(p["planStatus"] || "ACTIVE"),
              verificationStatus: String(p["verificationStatus"] || "PENDING"),
              verificationEvidenceUrl: p["verificationEvidenceUrl"] || null,
              hasEvidence: Array.isArray(p["evidencePaths"]) && p["evidencePaths"].length > 0,
              suspended: Boolean(p["suspended"]),
              suspendedAt: p["suspendedAt"] || null,
              suspendReason: p["suspendReason"] || null,
              payoutAccount: p["payoutAccount"] || null,
              submittedAt: p["verificationSubmittedAt"] || p["submittedAt"] || null,
              verifiedAt: p["verifiedAt"] || null,
            };
          });

          if (status && status !== "ALL") {
            if (status === "SUSPENDED") {
              mapped = mapped.filter((p) => p.suspended);
            } else {
              mapped = mapped.filter((p) => p.verificationStatus === status);
            }
          }

          if (q) {
            mapped = mapped.filter(
              (p) =>
                p.displayName.toLowerCase().includes(q) ||
                p.username.toLowerCase().includes(q) ||
                p.companyName.toLowerCase().includes(q) ||
                p.id.toLowerCase().includes(q),
            );
          }

          return Response.json({
            producers: mapped,
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
