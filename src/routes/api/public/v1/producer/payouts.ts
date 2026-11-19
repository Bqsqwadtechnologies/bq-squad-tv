import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requirePlatformRole } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/producer/payouts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requirePlatformRole(fs, user, "producer");
          const rows = await fs.query("payouts", {
            filters: [{ field: "uid", op: "EQUAL", value: user.uid }],
            orderByField: "createdAt",
            descending: true,
            limit: 50,
          });
          return Response.json(
            {
              items: rows.map((row) => ({
                id: row.__id,
                amountMinor: typeof row["amountMinor"] === "number" ? row["amountMinor"] : 0,
                currency: typeof row["currency"] === "string" ? row["currency"] : "USD",
                status: typeof row["status"] === "string" ? row["status"] : "UNKNOWN",
                createdAt: typeof row["createdAt"] === "string" ? row["createdAt"] : "",
                settledAt: typeof row["settledAt"] === "string" ? row["settledAt"] : null,
                settlementReference:
                  typeof row["settlementReference"] === "string"
                    ? row["settlementReference"]
                    : null,
              })),
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
