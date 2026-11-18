import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireAdminModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/admin/users/")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const { user, fs } = await requireUser(request);
        await requireAdminModule(fs, user, "users");

        const url = new URL(request.url);
        const search = url.searchParams.get("q")?.toLowerCase().trim();

        const allUsers = await fs.listCollection("users", { limit: 100 });
        let filtered = allUsers;
        if (search) {
          filtered = allUsers.filter(u => 
            (u["email"] as string)?.toLowerCase().includes(search) ||
            (u["id"] as string)?.toLowerCase().includes(search) ||
            (u["displayName"] as string)?.toLowerCase().includes(search)
          );
        }

        return Response.json({
          users: filtered.map(u => ({
            id: u["id"] || u["uid"],
            email: u["email"] || "",
            displayName: u["displayName"] || "Viewer",
            suspended: Boolean(u["suspended"]),
            createdAt: u["createdAt"] || null,
            roleTags: Array.isArray(u["roleTags"]) ? u["roleTags"] : [],
            riskScore: Number(u["riskScore"] || 0),
          })),
        });
      } catch (err: unknown) {
        return errorBody(err);
      }
    },
  }},
});
