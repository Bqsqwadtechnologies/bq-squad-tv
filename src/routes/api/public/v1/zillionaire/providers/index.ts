import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/zillionaire/providers/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "providers");

          const providers = await fs.query("providers", { limit: 100 });
          return Response.json({
            providers: providers.map((p) => ({
              id: p.__id || p["id"] || p["providerId"],
              name: p["name"] || "Provider",
              contactEmail: p["contactEmail"] || "",
              settlementCurrency: p["settlementCurrency"] || "NGN",
              providerShareBps: Number(p["providerShareBps"] || 2500),
              status: p["status"] || "active",
              createdAt: p["createdAt"] || null,
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "providers");

          const body = (await request.json()) as {
            name?: string;
            contactEmail?: string;
            settlementCurrency?: string;
            providerShareBps?: number;
            repUid?: string;
          };

          if (!body.name?.trim() || !body.contactEmail?.trim()) {
            return Response.json({ error: "Name and contact email are required" }, { status: 400 });
          }

          const providerId = `prov_${Date.now()}`;
          const newProvider = {
            providerId,
            name: body.name.trim(),
            contactEmail: body.contactEmail.trim().toLowerCase(),
            settlementCurrency: (body.settlementCurrency || "NGN").toUpperCase(),
            providerShareBps: Number(body.providerShareBps || 2500),
            status: "active",
            createdAt: new Date().toISOString(),
            createdByUid: user.uid,
          };

          await fs.setDoc(`providers/${providerId}`, newProvider);

          if (body.repUid?.trim()) {
            await fs.setDoc(`providerUsers/${body.repUid.trim()}`, {
              uid: body.repUid.trim(),
              providerId,
              status: "ACTIVE",
              assignedAt: new Date().toISOString(),
            });
          }

          await writeAuditLog(fs, {
            action: "provider_registered",
            actorUid: user.uid,
            targetType: "provider",
            targetId: providerId,
            reason: `Registered provider: ${body.name}`,
            metadata: { name: body.name, contactEmail: body.contactEmail },
          });

          return Response.json({ ok: true, provider: newProvider }, { status: 201 });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
