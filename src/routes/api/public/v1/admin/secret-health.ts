import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

const SECRET_NAMES = [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "PAYSTACK_SECRET_KEY",
  "PAYSTACK_PUBLIC_KEY",
  "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON",
  "GOOGLE_PLAY_PACKAGE_NAME",
  "CONFIG_BACKUP_KEY",
  "STREAMING_HMAC_SECRET",
  "MODAL_TOKEN_ID",
  "MODAL_TOKEN_SECRET",
  "STORAGE_LOV_BUNDLE_01",
  "STORAGE_B2_01_KEY_ID",
  "STORAGE_B2_01_APP_KEY",
  "STORAGE_B2_01_BUCKET_ID",
  "STORAGE_B2_01_ENDPOINT",
] as const;

export const Route = createFileRoute("/api/public/v1/admin/secret-health")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const user = await requireUser(request);
        const fs = await Firestore.create();
        await requireAdminModule(fs, user, "security");
        const secrets = SECRET_NAMES.map(name => ({
          name,
          status: typeof process.env[name] === "string" && process.env[name]!.trim().length > 0 ? "present" : "missing",
        }));
        return Response.json({
          checkedAt: new Date().toISOString(),
          presentCount: secrets.filter(item => item.status === "present").length,
          missingCount: secrets.filter(item => item.status === "missing").length,
          secrets,
        }, { headers: { "cache-control": "private, no-store" } });
      } catch (error) {
        return errorBody(error);
      }
    },
  } },
});
