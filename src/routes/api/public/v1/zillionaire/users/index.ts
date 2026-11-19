import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/users/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "users");

          const url = new URL(request.url);
          const search = url.searchParams.get("q")?.toLowerCase().trim();

          const allUsers = await fs.query("users", { limit: 100 });
          let filtered = allUsers;
          if (search) {
            filtered = allUsers.filter(
              (u) =>
                (u["email"] as string)?.toLowerCase().includes(search) ||
                (u["id"] as string)?.toLowerCase().includes(search) ||
                (u["uid"] as string)?.toLowerCase().includes(search) ||
                (u["displayName"] as string)?.toLowerCase().includes(search) ||
                (u["phone"] as string)?.toLowerCase().includes(search) ||
                (u["walletId"] as string)?.toLowerCase().includes(search) ||
                (u["deviceId"] as string)?.toLowerCase().includes(search),
            );
          }

          return Response.json({
            users: filtered.map((u) => ({
              id: u.__id || u["id"] || u["uid"],
              email: u["email"] || "",
              displayName: u["displayName"] || "Viewer",
              phone: u["phone"] || null,
              walletId: u["walletId"] || null,
              accountStatus: u["accountStatus"] || (u["suspended"] ? "SUSPENDED" : "ACTIVE"),
              suspended: Boolean(u["suspended"] || u["accountStatus"] === "SUSPENDED" || u["accountStatus"] === "BANNED"),
              createdAt: u["createdAt"] || null,
              roleTags: Array.isArray(u["roleTags"]) ? u["roleTags"] : [],
              riskScore: Number(u["riskScore"] || 0),
            })),
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
