import { createFileRoute } from "@tanstack/react-router";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";
import { discoverStorageDestinations } from "@/lib/server/storage/discovery";

function requireStepUp(authTime: number): void {
  const age = Math.floor(Date.now() / 1000) - authTime;
  if (!Number.isSafeInteger(authTime) || age < 0 || age > 300) {
    throw new ApiError(
      401,
      "STEP_UP_REQUIRED",
      "Sign in again to confirm this sensitive storage action.",
    );
  }
}

export const Route = createFileRoute("/api/public/v1/zillionaire/storage/discover")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          requireStepUp(user.authTime);
          const fs = await Firestore.create();
          const access = await requireZillionaireModule(fs, user, "system");
          if (!access.isZillionaireOwner)
            throw new ApiError(
              403,
              "OWNER_ONLY",
              "Only the protected platform owner can discover storage locations.",
            );
          const rows = await fs.query("storageDestinations", { limit: 500 });
          const registeredIds = new Set(rows.map((row) => row.__id));
          const result = await discoverStorageDestinations(process.env, registeredIds);
          return Response.json(
            {
              counts: result.counts,
              secretNames: result.secretNames,
              destinations: result.destinations.map((item) => ({
                destinationId: item.destinationId,
                providerType: item.providerType,
                bucketName: item.bucketName,
                credentialSource: item.credentialSource,
              })),
              note: "Only destination and setting names are returned. Connection values are never included.",
            },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
