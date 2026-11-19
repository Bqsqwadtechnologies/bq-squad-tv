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

          const [providersDocs, contractsDocs, statementsDocs, disputesDocs] = await Promise.all([
            fs.query("providers", { limit: 100 }),
            fs.query("providerContracts", { limit: 100 }),
            fs.query("providerStatements", { limit: 100 }),
            fs.query("providerDisputes", { limit: 100 }),
          ]);

          return Response.json({
            providers: providersDocs.map((p) => ({
              id: p.__id || p["id"] || p["providerId"],
              name: p["name"] || "Provider",
              contactEmail: p["contactEmail"] || "",
              settlementCurrency: p["settlementCurrency"] || "NGN",
              providerShareBps: Number(p["providerShareBps"] || 2500),
              status: p["status"] || "active",
              createdAt: p["createdAt"] || null,
            })),
            contracts: contractsDocs.map((c) => ({
              id: c.__id || c["contractId"] || c["id"],
              providerId: c["providerId"] || "",
              agreementReference: c["agreementReference"] || "AGR-DEFAULT",
              territories: Array.isArray(c["territories"]) ? c["territories"] : ["ALL"],
              platforms: Array.isArray(c["platforms"]) ? c["platforms"] : ["web", "android"],
              revenueModel: c["revenueModel"] || "provider_gross_profit_bps",
              providerShareBps: Number(c["providerShareBps"] || 2500),
              settlementCurrency: c["settlementCurrency"] || "NGN",
              validFrom: c["validFrom"] || null,
              validUntil: c["validUntil"] || null,
              version: Number(c["version"] || 1),
              status: c["status"] || "active",
            })),
            statements: statementsDocs.map((s) => ({
              id: s.__id || s["statementId"] || s["id"],
              providerId: s["providerId"] || "",
              period: s["period"] || "Current Month",
              status: s["status"] || "open",
              currency: s["currency"] || "NGN",
              grossRevenueMinor: Number(s["grossRevenueMinor"] || 0),
              grossProfitMinor: Number(s["grossProfitMinor"] || 0),
              providerEarningsMinor: Number(s["providerEarningsMinor"] || 0),
              platformShareMinor: Number(s["platformShareMinor"] || 0),
              paidAt: s["paidAt"] || null,
            })),
            disputes: disputesDocs.map((d) => ({
              id: d.__id || d["disputeId"] || d["id"],
              providerId: d["providerId"] || "",
              subject: d["subject"] || "General Dispute",
              statementId: d["statementId"] || null,
              channelId: d["channelId"] || null,
              status: d["status"] || "open",
              createdAt: d["createdAt"] || null,
              updatedAt: d["updatedAt"] || null,
              messagesCount: Array.isArray(d["messages"]) ? d["messages"].length : 0,
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
            action?: "create_provider" | "create_contract" | "resolve_dispute";
            name?: string;
            contactEmail?: string;
            settlementCurrency?: string;
            providerShareBps?: number;
            repUid?: string;
            // contract fields
            providerId?: string;
            agreementReference?: string;
            territories?: string[];
            validFrom?: string;
            validUntil?: string;
            // dispute fields
            disputeId?: string;
            resolutionNotes?: string;
          };

          const action = body.action || "create_provider";

          if (action === "create_contract") {
            if (!body.providerId?.trim() || !body.agreementReference?.trim()) {
              return Response.json(
                { error: "providerId and agreementReference are required" },
                { status: 400 },
              );
            }
            const contractId = `contract_${Date.now()}`;
            const contract = {
              contractId,
              providerId: body.providerId.trim(),
              agreementReference: body.agreementReference.trim(),
              territories: body.territories || ["ALL"],
              platforms: ["web", "android", "ios", "tv"],
              revenueModel: "provider_gross_profit_bps",
              providerShareBps: Number(body.providerShareBps || 2500),
              settlementCurrency: (body.settlementCurrency || "NGN").toUpperCase(),
              validFrom: body.validFrom || new Date().toISOString(),
              validUntil: body.validUntil || null,
              version: 1,
              status: "active",
              createdAt: new Date().toISOString(),
              createdByUid: user.uid,
            };
            await fs.setDoc(`providerContracts/${contractId}`, contract);
            await writeAuditLog(fs, {
              action: "provider_contract_created",
              actorUid: user.uid,
              targetType: "provider_contract",
              targetId: contractId,
              reason: `Created licence contract for ${body.providerId}`,
              metadata: contract,
            });
            return Response.json({ ok: true, contract }, { status: 201 });
          }

          if (action === "resolve_dispute") {
            if (!body.disputeId?.trim()) {
              return Response.json({ error: "disputeId is required" }, { status: 400 });
            }
            const dispute = await fs.getDoc(`providerDisputes/${body.disputeId.trim()}`);
            if (!dispute) {
              return Response.json({ error: "Dispute not found" }, { status: 404 });
            }
            const messages = Array.isArray(dispute["messages"]) ? [...dispute["messages"]] : [];
            if (body.resolutionNotes?.trim()) {
              messages.push({
                sender: "zillionaire_admin",
                senderUid: user.uid,
                text: `[Resolution Notes]: ${body.resolutionNotes.trim()}`,
                timestamp: new Date().toISOString(),
              });
            }
            await fs.patchDoc(`providerDisputes/${body.disputeId.trim()}`, {
              status: "resolved",
              resolvedAt: new Date().toISOString(),
              resolvedByUid: user.uid,
              messages,
            });
            await writeAuditLog(fs, {
              action: "provider_dispute_resolved",
              actorUid: user.uid,
              targetType: "provider_dispute",
              targetId: body.disputeId.trim(),
              reason: body.resolutionNotes || "Dispute resolved by administrator",
              metadata: { disputeId: body.disputeId },
            });
            return Response.json({ ok: true, resolved: true });
          }

          // default: create_provider
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
