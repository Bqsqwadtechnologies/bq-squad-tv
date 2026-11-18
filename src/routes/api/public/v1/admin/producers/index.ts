import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/producers/")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "producers");

        const producers = await fs.listCollection("producers", { limit: 100 });
        return Response.json({
          producers: producers.map(p => ({
            id: p["id"] || p["uid"],
            displayName: p["displayName"] || "Producer",
            companyName: p["companyName"] || "",
            planStatus: p["planStatus"] || "PENDING",
            verificationStatus: p["verificationStatus"] || "PENDING",
            verificationEvidenceUrl: p["verificationEvidenceUrl"] || null,
            submittedAt: p["submittedAt"] || null,
            verifiedAt: p["verifiedAt"] || null,
          })),
        });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
