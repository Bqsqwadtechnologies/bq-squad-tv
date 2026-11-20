import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { writeAuditLog } from "@/lib/server/audit";

export interface SecretCatalogEntry {
  name: string;
  category:
    | "Identity & Authentication"
    | "Payment Processing"
    | "Streaming & Media"
    | "Infrastructure & Compute"
    | "Storage & Backup";
  description: string;
  recommendedRotationDays: number;
  rotationReminder: string;
}

export const SECRET_CATALOG: readonly SecretCatalogEntry[] = [
  {
    name: "FIREBASE_SERVICE_ACCOUNT_JSON",
    category: "Identity & Authentication",
    description: "Firebase Admin SDK service-account credentials",
    recommendedRotationDays: 180,
    rotationReminder:
      "Firebase Console → Project Settings → Service accounts → generate a replacement key, deploy it, verify, then revoke the old key.",
  },
  {
    name: "ZILLIONAIRE_MFA_ENCRYPTION_KEY",
    category: "Identity & Authentication",
    description: "Server-side key protecting owner authenticator secrets",
    recommendedRotationDays: 365,
    rotationReminder:
      "Plan a versioned migration before replacing this key; changing it without re-encrypting stored authenticator secrets can lock out the owner.",
  },
  {
    name: "ZILLIONAIRE_ACCESS_PASSWORD",
    category: "Identity & Authentication",
    description: "Secondary owner-console access password",
    recommendedRotationDays: 90,
    rotationReminder:
      "Update in the deployment's server-side secret settings and verify access before ending the current session.",
  },
  {
    name: "AUDIT_HASH_KEY",
    category: "Identity & Authentication",
    description: "Server-side HMAC key for privacy-preserving audit identifiers",
    recommendedRotationDays: 180,
    rotationReminder:
      "Rotate through a planned key-version migration if historic identifiers must remain verifiable.",
  },
  {
    name: "SESSION_SECRET",
    category: "Identity & Authentication",
    description: "Server-side session signing secret where configured",
    recommendedRotationDays: 180,
    rotationReminder:
      "Update in deployment secrets and verify active session behavior; rotation may invalidate existing sessions.",
  },
  {
    name: "WEB_SESSION_SECRET",
    category: "Identity & Authentication",
    description: "Web session signing secret where configured",
    recommendedRotationDays: 180,
    rotationReminder:
      "Update in deployment secrets and verify active session behavior; rotation may invalidate existing sessions.",
  },
  {
    name: "PAYSTACK_SECRET_KEY",
    category: "Payment Processing",
    description: "Paystack server-side API credential",
    recommendedRotationDays: 90,
    rotationReminder:
      "Paystack Dashboard → Settings → API Keys & Webhooks; update the deployment secret, verify transactions, then revoke the old key.",
  },
  {
    name: "PAYSTACK_PUBLIC_KEY",
    category: "Payment Processing",
    description: "Paystack public checkout configuration; not a server secret",
    recommendedRotationDays: 180,
    rotationReminder:
      "Update the public checkout configuration and verify a test transaction; never treat this key as the server credential.",
  },
  {
    name: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
    category: "Payment Processing",
    description: "Google Play Developer API service-account credentials",
    recommendedRotationDays: 180,
    rotationReminder:
      "Create a replacement key in Google Cloud IAM, deploy and verify purchase checks, then revoke the old key.",
  },
  {
    name: "GOOGLE_PLAY_PACKAGE_NAME",
    category: "Payment Processing",
    description: "Android package identifier used for purchase verification",
    recommendedRotationDays: 365,
    rotationReminder:
      "Confirm the identifier against the Play Console; this is configuration, not a credential.",
  },
  {
    name: "STREAMING_HMAC_SECRET",
    category: "Streaming & Media",
    description: "HMAC key used for streaming tokens where enabled",
    recommendedRotationDays: 90,
    rotationReminder:
      "Use a versioned overlap window if supported; verify playback before revoking the old key.",
  },
  {
    name: "STREAMING_URL_ENCRYPTION_KEYS_JSON",
    category: "Streaming & Media",
    description: "Versioned key ring for encrypted streaming URLs",
    recommendedRotationDays: 365,
    rotationReminder:
      "Add a new key version, make it active, re-encrypt or allow old-version reads, then retire the previous version.",
  },
  {
    name: "STREAMING_PROVIDER_CREDENTIALS_KEYS_JSON",
    category: "Streaming & Media",
    description: "Versioned key ring for streaming-provider credentials",
    recommendedRotationDays: 365,
    rotationReminder:
      "Add a new key version, migrate encrypted records, verify playback, then retire the previous version.",
  },
  {
    name: "VIDEO_WORKER_KEYS_JSON",
    category: "Infrastructure & Compute",
    description: "Per-worker HMAC credentials for video-processing workers",
    recommendedRotationDays: 90,
    rotationReminder:
      "Rotate each worker credential in the API and worker secret stores, verify signed requests, then remove the old credential.",
  },
  {
    name: "MODAL_WAKE_SECRET",
    category: "Infrastructure & Compute",
    description: "Shared server-side secret for authorized worker wake requests",
    recommendedRotationDays: 90,
    rotationReminder:
      "Update the API and worker secret stores together, verify the wake flow, then revoke the old value.",
  },
  {
    name: "MODAL_TOKEN_ID",
    category: "Infrastructure & Compute",
    description: "Modal API token identifier",
    recommendedRotationDays: 180,
    rotationReminder:
      "Create a replacement token in Modal, update the deployment secret, verify, then revoke the old token.",
  },
  {
    name: "MODAL_TOKEN_SECRET",
    category: "Infrastructure & Compute",
    description: "Modal API token secret",
    recommendedRotationDays: 180,
    rotationReminder:
      "Create a replacement token in Modal, update the deployment secret, verify, then revoke the old token.",
  },
  {
    name: "BREVO_API_KEY",
    category: "Infrastructure & Compute",
    description: "Transactional email API key, if configured",
    recommendedRotationDays: 90,
    rotationReminder:
      "Generate a replacement in the Brevo dashboard, update deployment secrets, verify mail delivery, then revoke the old key.",
  },
  {
    name: "CONFIG_BACKUP_KEY",
    category: "Storage & Backup",
    description: "Encryption key for configuration backups when enabled",
    recommendedRotationDays: 365,
    rotationReminder:
      "Plan an encrypted backup migration before replacing this key; verify a restore before retiring the old key.",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    category: "Storage & Backup",
    description: "Supabase server-side service-role credential, when Supabase is connected",
    recommendedRotationDays: 90,
    rotationReminder:
      "Rotate in Supabase project settings, update server-side deployment secrets, verify, then revoke the old key.",
  },
] as const;

const recordRotationSchema = z.object({
  secretName: z.string().trim().min(1).max(120),
  rotationCycleDays: z.number().int().min(1).max(730).optional(),
});

export const Route = createFileRoute("/api/public/v1/zillionaire/secret-health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");

          // Read stored rotation metadata records from Firestore
          const storedRotations = await fs.query("platformSecretRotations", { limit: 100 });

          const rotationMap = new Map<string, Record<string, unknown>>();
          for (const doc of storedRotations) {
            if (doc.__id) rotationMap.set(doc.__id, doc);
          }

          const now = Date.now();
          let overdueCount = 0;
          let dueSoonCount = 0;

          const secrets = SECRET_CATALOG.map((entry) => {
            const isPresent =
              typeof process.env[entry.name] === "string" &&
              process.env[entry.name]!.trim().length > 0;

            const record = rotationMap.get(entry.name);
            const lastRotatedAt =
              typeof record?.["lastRotatedAt"] === "string"
                ? (record["lastRotatedAt"] as string)
                : null;
            const cycleDays =
              typeof record?.["rotationCycleDays"] === "number"
                ? (record["rotationCycleDays"] as number)
                : entry.recommendedRotationDays;

            let nextDueAt: string | null = null;
            let isOverdue = false;
            let rotationStatus: "healthy" | "due_soon" | "overdue" | "not_recorded" =
              "not_recorded";

            if (lastRotatedAt) {
              const rotatedTime = Date.parse(lastRotatedAt);
              if (Number.isFinite(rotatedTime)) {
                const dueTime = rotatedTime + cycleDays * 24 * 60 * 60 * 1000;
                nextDueAt = new Date(dueTime).toISOString();
                isOverdue = now > dueTime;
                const isDueSoon = now > dueTime - 14 * 24 * 60 * 60 * 1000;

                if (isOverdue) {
                  rotationStatus = "overdue";
                  overdueCount++;
                } else if (isDueSoon) {
                  rotationStatus = "due_soon";
                  dueSoonCount++;
                } else {
                  rotationStatus = "healthy";
                }
              }
            }

            return {
              name: entry.name,
              category: entry.category,
              description: entry.description,
              status: isPresent ? ("present" as const) : ("missing" as const),
              recommendedRotationDays: entry.recommendedRotationDays,
              rotationCycleDays: cycleDays,
              rotationReminder: entry.rotationReminder,
              lastRotatedAt,
              nextDueAt,
              isOverdue,
              rotationStatus,
            };
          });

          return Response.json(
            {
              checkedAt: new Date().toISOString(),
              presentCount: secrets.filter((item) => item.status === "present").length,
              missingCount: secrets.filter((item) => item.status === "missing").length,
              overdueCount,
              dueSoonCount,
              secrets,
            },
            { headers: { "cache-control": "no-store, private" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },

      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, recordRotationSchema);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "security");

          const catalogEntry = SECRET_CATALOG.find((s) => s.name === body.secretName);
          if (!catalogEntry) {
            throw new ApiError(
              400,
              "UNKNOWN_SECRET_NAME",
              "The specified secret name is not in the system secret catalog.",
            );
          }

          const rotatedAt = new Date().toISOString();
          const cycleDays = body.rotationCycleDays ?? catalogEntry.recommendedRotationDays;
          const rotatedTime = new Date(rotatedAt).getTime();
          const nextDueAt = new Date(rotatedTime + cycleDays * 24 * 60 * 60 * 1000).toISOString();

          const rotationPath = `platformSecretRotations/${body.secretName}`;
          await fs.transact([rotationPath], (documents) => ({
            result: undefined,
            writes: [
              {
                update: {
                  name: fs.docName(rotationPath),
                  fields: {
                    secretName: { stringValue: body.secretName },
                    lastRotatedAt: { stringValue: rotatedAt },
                    rotationCycleDays: { integerValue: String(cycleDays) },
                    nextDueAt: { stringValue: nextDueAt },
                    rotatedBy: { stringValue: user.uid },
                    updatedAt: { stringValue: new Date().toISOString() },
                  },
                },
                currentDocument: { exists: documents[0] !== null },
              },
            ],
          }));

          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "secret.rotation_recorded",
            targetType: "secret",
            targetId: body.secretName,
            reason: "Owner recorded provider-side secret rotation",
            metadata: {
              lastRotatedAt: rotatedAt,
              nextDueAt,
              rotationCycleDays: cycleDays,
            },
          });

          return Response.json({
            success: true,
            secretName: body.secretName,
            lastRotatedAt: rotatedAt,
            nextDueAt,
            rotationCycleDays: cycleDays,
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
