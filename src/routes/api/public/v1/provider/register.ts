import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { getConfiguredOwnerEmail } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export const Route = createFileRoute("/api/public/v1/provider/register")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();

          const providerUser = await fs.getDoc(`providerUsers/${user.uid}`);
          if (!providerUser) {
            return Response.json({ registered: false, status: "unregistered" });
          }

          const providerDoc = await fs.getDoc(`providers/${providerUser["providerId"]}`);
          return Response.json({
            registered: true,
            providerId: providerUser["providerId"],
            provider: providerDoc,
            status: providerDoc?.["status"] || "pending_approval",
            sandboxCredentials: providerDoc?.["sandboxCredentials"] || null,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const body = (await request.json().catch(() => ({}))) as {
            // Step 1: Company info
            name?: string;
            country?: string;
            website?: string;
            contactEmail?: string;
            contactPhone?: string;

            // Step 2: Legal & tax
            registrationNumber?: string;
            taxId?: string;
            registeredAddress?: string;
            legalEntityType?: string;

            // Step 3: Ingest technical profile
            primaryProtocol?: string;
            estimatedBitrateMbps?: number;
            targetResolution?: string;
            backupRedundancy?: boolean;

            // Step 4: Settlement bank account
            bankName?: string;
            accountNumber?: string;
            accountName?: string;
            swiftBic?: string;
            settlementCurrency?: string;

            // Step 5: Master agreement e-signature
            eSignatureName?: string;
            signerTitle?: string;
            agreementAgreedAt?: string;
          };

          const callerEmail = (user.email || body.contactEmail || "").trim().toLowerCase();
          if (!callerEmail) {
            throw new ApiError(
              400,
              "EMAIL_REQUIRED",
              "A valid email address is required to register a provider.",
            );
          }

          const ownerEmail = getConfiguredOwnerEmail();
          const isOwner = Boolean(ownerEmail && callerEmail === ownerEmail);

          if (!isOwner) {
            const approvedDoc = await fs.getDoc(`approvedProviders/${callerEmail}`);
            const isApproved =
              approvedDoc &&
              (approvedDoc["status"] === "granted" ||
                approvedDoc["status"] === "verified" ||
                approvedDoc["status"] === "approved");
            if (!isApproved) {
              throw new ApiError(
                403,
                "REGISTRATION_NOT_PERMITTED",
                "We couldn't create this account. Request access at tv.bqsqwad.com/provider.",
              );
            }
          }

          const providerId = `prov_${Date.now()}`;
          const providerName = (body.name || callerEmail.split("@")[0] || "Channel Partner").trim();
          const settlementCurrency = (body.settlementCurrency || "USD").toUpperCase();

          // Sandbox ingest testing credentials issued immediately on submission
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          const sandboxCredentials = {
            rtmpIngestUrl: "rtmp://ingest-sandbox.bqsqwad.tv/live",
            streamKey: `sk_sandbox_${providerId}_${randomSuffix}`,
            srtUrl: `srt://ingest-sandbox.bqsqwad.tv:9998?streamid=sandbox_${providerId}`,
            issuedAt: new Date().toISOString(),
            status: "active",
          };

          const initialStatus = isOwner ? "active" : "pending_approval";

          const providerRecord = {
            providerId,
            name: providerName,
            country: body.country || "Global",
            website: body.website || "",
            contactEmail: callerEmail,
            contactPhone: body.contactPhone || "",
            legal: {
              registrationNumber: body.registrationNumber || "",
              taxId: body.taxId || "",
              registeredAddress: body.registeredAddress || "",
              legalEntityType: body.legalEntityType || "Corporation",
            },
            technicalProfile: {
              primaryProtocol: body.primaryProtocol || "RTMP",
              estimatedBitrateMbps: Number(body.estimatedBitrateMbps || 6.0),
              targetResolution: body.targetResolution || "1080p60",
              backupRedundancy: Boolean(body.backupRedundancy ?? true),
            },
            settlement: {
              bankName: body.bankName || "",
              accountNumber: body.accountNumber || "",
              accountName: body.accountName || "",
              swiftBic: body.swiftBic || "",
              currency: settlementCurrency,
            },
            eSignature: {
              name: body.eSignatureName || providerName,
              title: body.signerTitle || "Authorized Signatory",
              signedAt: body.agreementAgreedAt || new Date().toISOString(),
            },
            settlementCurrency,
            providerShareBps: 2500,
            status: initialStatus,
            sandboxCredentials,
            estimatedReviewHours: "24-48 hours",
            registeredByUid: user.uid,
            createdAt: new Date().toISOString(),
          };

          await fs.setDoc(`providers/${providerId}`, providerRecord);
          await fs.setDoc(`providerUsers/${user.uid}`, {
            uid: user.uid,
            providerId,
            status: initialStatus.toUpperCase(),
            assignedAt: new Date().toISOString(),
          });

          // Create automatic approval ticket for review
          const approvalId = `appr_${Date.now()}_${randomSuffix}`;
          await fs.setDoc(`approvals/${approvalId}`, {
            approvalId,
            type: "provider_approval",
            targetType: "provider",
            targetId: providerId,
            providerName,
            contactEmail: callerEmail,
            country: body.country || "Global",
            status: isOwner ? "APPROVED" : "PENDING",
            createdAt: new Date().toISOString(),
            metadata: {
              providerId,
              settlementCurrency,
              technicalProfile: providerRecord.technicalProfile,
              eSignature: providerRecord.eSignature,
            },
          });

          // Update user roles to include provider
          const existingUser = await fs.getDoc(`users/${user.uid}`);
          const currentRoles = Array.isArray(existingUser?.["roles"])
            ? (existingUser?.["roles"] as string[])
            : ["viewer"];
          const updatedRoles = Array.from(new Set([...currentRoles, "provider"]));
          await fs.setDoc(`users/${user.uid}`, {
            ...existingUser,
            roles: updatedRoles,
            providerId,
            updatedAt: new Date().toISOString(),
          });

          await writeAuditLog(fs, {
            action: "provider_registration_submitted",
            actorUid: user.uid,
            targetType: "provider",
            targetId: providerId,
            reason: "Provider onboarding registration completed with 5-step stepper",
            metadata: { email: callerEmail, providerName, settlementCurrency, approvalId },
          });

          return Response.json(
            {
              ok: true,
              providerId,
              name: providerName,
              status: initialStatus,
              sandboxCredentials,
              estimatedReviewTime: "24-48 hours",
              approvalTicketId: approvalId,
            },
            { status: 201 },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
