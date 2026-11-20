import { describe, it, expect } from "vitest";
import { Route as CopyrightCasesRoute } from "@/routes/zillionaire.copyright-cases";
import { Route as CollaborationsRoute } from "@/routes/zillionaire.collaborations";
import { Route as SplitsAuditRoute } from "@/routes/zillionaire.splits-audit";
import { Route as SupportMacrosRoute } from "@/routes/zillionaire.support-macros";
import { Route as AnnouncementsRoute } from "@/routes/zillionaire.announcements";
import { Route as GeoRulesRoute } from "@/routes/zillionaire.geo-rules";
import { Route as ContentCalendarRoute } from "@/routes/zillionaire.content-calendar";
import { Route as StrikesAppealsRoute } from "@/routes/zillionaire.strikes-appeals";
import { Route as ScheduledReportsRoute } from "@/routes/zillionaire.scheduled-reports";
import { Route as PrivacyRequestsRoute } from "@/routes/zillionaire.privacy-requests";
import { Route as ModerationWorkloadRoute } from "@/routes/zillionaire.moderation-workload";
import { Route as FraudWatchRoute } from "@/routes/zillionaire.fraud-watch";
import { Route as StatusPageRoute } from "@/routes/zillionaire.status-page";
import { Route as ReleasesRoute } from "@/routes/zillionaire.releases";
import { Route as SearchTuningRoute } from "@/routes/zillionaire.search-tuning";
import { Route as TrendingRailsRoute } from "@/routes/zillionaire.trending-rails";

describe("Batch 11 Zillionaire extras routes", () => {
  const routes = [
    { name: "Copyright Cases", route: CopyrightCasesRoute, path: "/zillionaire/copyright-cases" },
    { name: "Collaborations Oversight", route: CollaborationsRoute, path: "/zillionaire/collaborations" },
    { name: "Splits Audit", route: SplitsAuditRoute, path: "/zillionaire/splits-audit" },
    { name: "Support Macros", route: SupportMacrosRoute, path: "/zillionaire/support-macros" },
    { name: "Announcements & Banners", route: AnnouncementsRoute, path: "/zillionaire/announcements" },
    { name: "Geo Rules", route: GeoRulesRoute, path: "/zillionaire/geo-rules" },
    { name: "Content Calendar", route: ContentCalendarRoute, path: "/zillionaire/content-calendar" },
    { name: "Strikes & Appeals", route: StrikesAppealsRoute, path: "/zillionaire/strikes-appeals" },
    { name: "Scheduled Reports", route: ScheduledReportsRoute, path: "/zillionaire/scheduled-reports" },
    { name: "Privacy Requests", route: PrivacyRequestsRoute, path: "/zillionaire/privacy-requests" },
    { name: "Moderator Workload", route: ModerationWorkloadRoute, path: "/zillionaire/moderation-workload" },
    { name: "Fraud Watch", route: FraudWatchRoute, path: "/zillionaire/fraud-watch" },
    { name: "Status Page", route: StatusPageRoute, path: "/zillionaire/status-page" },
    { name: "Releases & Lock", route: ReleasesRoute, path: "/zillionaire/releases" },
    { name: "Search Tuning", route: SearchTuningRoute, path: "/zillionaire/search-tuning" },
    { name: "Trending & Rails", route: TrendingRailsRoute, path: "/zillionaire/trending-rails" },
  ];

  it("exports all 16 valid TanStack route definitions with matching paths", () => {
    expect(routes).toHaveLength(16);
    for (const item of routes) {
      expect(item.route, `${item.name} should be defined`).toBeDefined();
      expect(typeof item.route.options.component).toBe("function");
    }
  });

  it("registers head meta title for each route", () => {
    for (const item of routes) {
      if (typeof item.route.options.head === "function") {
        const head = (item.route.options.head as any)();
        expect(head.meta).toBeDefined();
        const titleMeta = head.meta.find((m: any) => m.title);
        expect(titleMeta?.title).toContain("Zillionaire Control Centre");
      }
    }
  });
});
