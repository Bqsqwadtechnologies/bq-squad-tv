import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { errorBody, requireUser } from "@/lib/server/api";
import { requireZillionaireModule } from "@/lib/server/roles";

export const Route = createFileRoute("/api/public/v1/zillionaire/ads/reports")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          await requireZillionaireModule(fs, user, "ads");

          // Aggregated summary across events and units
          const units = await fs.query("adUnits", { limit: 100 }).catch(() => []);
          const events = await fs.query("adEvents", { limit: 500 }).catch(() => []);

          const byPlatform: Record<"web" | "android", { impressions: number; clicks: number; revenueEstMinor: number }> = {
            web: { impressions: 0, clicks: 0, revenueEstMinor: 0 },
            android: { impressions: 0, clicks: 0, revenueEstMinor: 0 },
          };

          for (const ev of events) {
            const p = ev["platform"] === "android" ? "android" : "web";
            if (ev["event"] === "impression" || ev["event"] === "complete") {
              byPlatform[p].impressions++;
              byPlatform[p].revenueEstMinor += 25; // estimated ₦0.25 eCPM
            } else if (ev["event"] === "click") {
              byPlatform[p].clicks++;
              byPlatform[p].revenueEstMinor += 150; // estimated ₦1.50 CPC
            }
          }

          const unitRows = units.map((u) => {
            const unitEvents = events.filter((e) => e["slot"] === u["placement"]);
            const imp = unitEvents.filter((e) => e["event"] === "impression" || e["event"] === "complete").length;
            const clk = unitEvents.filter((e) => e["event"] === "click").length;
            const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(2) : "0.00";
            const revMinor = imp * 25 + clk * 150;
            return {
              unitId: u.__id,
              name: String(u["name"] || "Unit"),
              platform: u["platform"] === "android" ? "android" : "web",
              placement: String(u["placement"] || "home_row"),
              impressions: imp,
              clicks: clk,
              ctr: `${ctr}%`,
              revenueMinor: revMinor,
              revenueFormatted: `₦${(revMinor / 100).toFixed(2)}`,
            };
          });

          const totalImp = byPlatform.web.impressions + byPlatform.android.impressions;
          const totalClk = byPlatform.web.clicks + byPlatform.android.clicks;
          const overallCtr = totalImp > 0 ? ((totalClk / totalImp) * 100).toFixed(2) : "0.00";
          const totalRevMinor = byPlatform.web.revenueEstMinor + byPlatform.android.revenueEstMinor;

          return Response.json({
            summary: {
              totalImpressions: totalImp,
              totalClicks: totalClk,
              overallCtr: `${overallCtr}%`,
              totalRevenueMinor: totalRevMinor,
              totalRevenueFormatted: `₦${(totalRevMinor / 100).toFixed(2)}`,
              byPlatform,
            },
            units: unitRows,
          });
        } catch (e) {
          return errorBody(e);
        }
      },
    },
  },
});
