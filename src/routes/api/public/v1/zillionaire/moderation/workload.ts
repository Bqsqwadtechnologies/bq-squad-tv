import { createFileRoute } from "@tanstack/react-router";
import { errorBody, requireUser } from "@/lib/server/api";
import { Firestore } from "@/lib/server/firebase-admin";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/moderation/workload")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "moderation");

          // Query real team members with moderation capability
          const [teamDocs, auditDocs, pendingComments, pendingReports] = await Promise.all([
            fs.query("teamMembers", { limit: 50 }).catch(() => []),
            fs.query("auditLogs", {
              filters: [{ field: "action", op: "GREATER_THAN_OR_EQUAL", value: "moderation." }],
              limit: 200,
            }).catch(() => []),
            fs.query("contentComments", {
              filters: [{ field: "status", op: "EQUAL", value: "PENDING" }],
              limit: 200,
            }).catch(() => []),
            fs.query("userReports", {
              filters: [{ field: "status", op: "EQUAL", value: "OPEN" }],
              limit: 200,
            }).catch(() => []),
          ]);

          const moderators = teamDocs.filter((m) => {
            const roles = Array.isArray(m["roles"]) ? m["roles"] : [m["role"]];
            return roles.includes("moderator") || roles.includes("admin") || roles.includes("compliance") || roles.includes("owner");
          });

          // Build realistic workload per active team member
          const workloads = moderators.map((mod) => {
            const uid = mod["uid"] || mod.__id;
            const email = mod["email"] || "moderator@bqsqwad.tv";
            const name = String(mod["name"] || mod["displayName"] || email.split("@")[0]);

            // Count actions today by this user
            const todayStr = new Date().toISOString().slice(0, 10);
            const userAudits = auditDocs.filter((a) => a["actorUid"] === uid && String(a["createdAt"] || "").startsWith(todayStr));

            return {
              id: `mod_${String(uid).slice(0, 10)}`,
              moderatorName: name,
              email,
              assignedQueue: (mod["assignedQueue"] || "comment_flags") as "video_reviews" | "comment_flags" | "copyright_claims",
              pendingItems: Math.min(25, pendingComments.length + pendingReports.length),
              completedToday: userAudits.length,
              avgResolutionMinutes: Number(mod["avgResolutionMinutes"] || 3.5),
              activeStatus: (mod["activeStatus"] || "on_duty") as "on_duty" | "break" | "offline",
            };
          });

          return Response.json({
            workloads,
            stats: {
              totalModerators: workloads.length,
              activeOnDuty: workloads.filter((w) => w.activeStatus === "on_duty").length,
              totalPendingQueue: pendingComments.length + pendingReports.length,
            },
          });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
