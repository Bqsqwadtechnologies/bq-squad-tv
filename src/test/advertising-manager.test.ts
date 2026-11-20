import { describe, expect, it, vi, beforeEach } from "vitest";
import { Route as UnitsRoute } from "@/routes/api/public/v1/zillionaire/ads/units";
import { Route as CreativesRoute } from "@/routes/api/public/v1/zillionaire/ads/creatives";
import { Route as SettingsRoute } from "@/routes/api/public/v1/zillionaire/ads/settings";
import { Route as ReportsRoute } from "@/routes/api/public/v1/zillionaire/ads/reports";
import { Route as NextAdRoute } from "@/routes/api/public/v1/ads/next";
import { Firestore } from "@/lib/server/firebase-admin";
import * as apiModule from "@/lib/server/api";
import * as rolesModule from "@/lib/server/roles";
import * as auditModule from "@/lib/server/audit";

function createMemoryFirestore() {
  const storedDocs: Record<string, Record<string, unknown>> = {
    "adProviders/web": {
      enabled: true,
      providerId: "admob",
    },
    "adProviders/android": {
      enabled: true,
      providerId: "admob",
    },
    "config/adSettings": {
      paidViewersAdFree: false,
      kidsProtectionEnabled: true,
      adultChannelRestricted: true,
    },
    "channels/ch_normal": {
      __id: "ch_normal",
      title: "BQ SQWAD Sports",
      published: true,
      ageRating: "PG",
      adultOnly: false,
    },
    "channels/ch_adult": {
      __id: "ch_adult",
      title: "Late Night MMA (18+)",
      published: true,
      ageRating: "18+",
      adultOnly: true,
    },
    "users/kid_viewer": {
      uid: "kid_viewer",
      childProfile: true,
      childMode: true,
    },
    "users/paid_viewer": {
      uid: "paid_viewer",
      hasPaidSubscription: true,
      isPaidViewer: true,
      roleTags: ["subscriber"],
    },
    "users/free_viewer": {
      uid: "free_viewer",
      childProfile: false,
      childMode: false,
      hasPaidSubscription: false,
      adultEligible: true,
    },
  };

  const fs = {
    docName: (path: string) => `projects/test-project/databases/(default)/documents/${path}`,
    getDoc: vi.fn(async (path: string) => (storedDocs[path] ? { ...storedDocs[path] } : null)),
    setDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...fields };
    }),
    patchDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      storedDocs[path] = { ...(storedDocs[path] || {}), ...fields };
    }),
    transact: vi.fn(async () => ({ result: { remaining: 10, resetAt: Date.now() + 60000 }, writes: [] })),
    deleteDoc: vi.fn(async (path: string) => {
      delete storedDocs[path];
    }),
    query: vi.fn(async (collectionId: string) => {
      if (collectionId === "adUnits") {
        return Object.entries(storedDocs)
          .filter(([k]) => k.startsWith("adUnits/"))
          .map(([k, v]) => ({ __id: k.replace("adUnits/", ""), ...v }));
      }
      if (collectionId === "adCreatives") {
        return Object.entries(storedDocs)
          .filter(([k]) => k.startsWith("adCreatives/"))
          .map(([k, v]) => ({ __id: k.replace("adCreatives/", ""), ...v }));
      }
      if (collectionId === "adCampaigns") {
        return [
          {
            __id: "camp_1",
            status: "ACTIVE",
            title: "Super Cup 2026 Promo",
            category: "sports",
            ageRating: "G",
            platforms: ["web", "android"],
            placements: ["home_banner"],
            creativeUrl: "https://storage.bq-sqwad.tv/ads/banner.jpg",
          },
        ];
      }
      if (collectionId === "adEvents") {
        return [
          {
            __id: "ev_1",
            event: "impression",
            platform: "web",
            slot: "home_row",
          },
          {
            __id: "ev_2",
            event: "click",
            platform: "web",
            slot: "home_row",
          },
        ];
      }
      return [];
    }),
  };

  return { fs, storedDocs };
}

describe("Advertising Manager Backend & Policy Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles Ad Units CRUD with role guarding and audit logging", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "admin_user",
      email: "zillionaire@bq-sqwad.tv",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);
    const auditSpy = vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined as any);

    // 1. Create Unit
    const postHandler = (UnitsRoute.options.server?.handlers as any)?.POST;
    expect(postHandler).toBeDefined();

    const createReq = new Request("https://test.local/api/public/v1/zillionaire/ads/units", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE",
        name: "Web Home Row Banner",
        platform: "web",
        type: "banner",
        placement: "home_row",
        size: "728x90",
        frequencyCap: 4,
        priority: 10,
        targetCountries: ["NG"],
        targetChannels: [],
        targetAgeRating: "all",
        targetAudience: "all",
        enabled: true,
        reason: "Provisioning main leaderboard for home discovery",
      }),
    });

    const createRes = await postHandler({ request: createReq });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.unit.name).toBe("Web Home Row Banner");
    expect(auditSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "ads.unit_create",
        reason: "Provisioning main leaderboard for home discovery",
      }),
    );

    // 2. GET Units
    const getHandler = (UnitsRoute.options.server?.handlers as any)?.GET;
    const getReq = new Request("https://test.local/api/public/v1/zillionaire/ads/units?platform=web");
    const getRes = await getHandler({ request: getReq });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.units.length).toBeGreaterThan(0);
  });

  it("handles Ad Creatives moderation queue", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({
      uid: "admin_user",
      email: "zillionaire@bq-sqwad.tv",
    } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);
    vi.spyOn(auditModule, "writeAuditLog").mockResolvedValue(undefined as any);

    const postHandler = (CreativesRoute.options.server?.handlers as any)?.POST;

    // Create creative
    const createReq = new Request("https://test.local/api/public/v1/zillionaire/ads/creatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "CREATE",
        title: "Test Creative Asset",
        type: "image",
        mediaUrl: "https://cdn.bq-sqwad.tv/ads/banner.jpg",
        clickThroughUrl: "https://bq-sqwad.tv/offer",
        reason: "Testing creative asset upload",
      }),
    });
    const createRes = await postHandler({ request: createReq });
    expect(createRes.status).toBe(200);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    const creativeId = createData.creative.id;

    // Moderate / Reject creative
    const modReq = new Request("https://test.local/api/public/v1/zillionaire/ads/creatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "MODERATE",
        creativeId,
        decision: "REJECT",
        rejectionReason: "Resolution does not meet guidelines",
        reason: "Auditor rejection for quality",
      }),
    });
    const modRes = await postHandler({ request: modReq });
    expect(modRes.status).toBe(200);
    const modData = await modRes.json();
    expect(modData.status).toBe("REJECTED");
  });

  it("reports ad impressions, clicks, and revenue estimates", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "admin_user" } as any);
    vi.spyOn(rolesModule, "requireZillionaireModule").mockResolvedValue(undefined as any);

    const getHandler = (ReportsRoute.options.server?.handlers as any)?.GET;
    const req = new Request("https://test.local/api/public/v1/zillionaire/ads/reports");
    const res = await getHandler({ request: req });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.summary).toBeDefined();
    expect(data.summary.totalImpressions).toBe(1);
    expect(data.summary.totalClicks).toBe(1);
  });

  it("enforces kid profile protection in ads/next", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "kid_viewer" } as any);
    vi.spyOn(apiModule, "getUserProfile").mockResolvedValue({
      profileComplete: true,
      adultEligible: false,
      roleTags: [],
      countryCode: "NG",
    });

    const getHandler = (NextAdRoute.options.server?.handlers as any)?.GET;
    const req = new Request("https://test.local/api/public/v1/ads/next?platform=web&slot=home_banner");
    const res = await getHandler({ request: req });
    expect(res.status).toBe(200);
    const ad = await res.json();
    // Must return null because viewer is a kid profile
    expect(ad).toBeNull();
  });

  it("enforces adult-channel ad exclusion in ads/next", async () => {
    const { fs } = createMemoryFirestore();
    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "free_viewer" } as any);
    vi.spyOn(apiModule, "getUserProfile").mockResolvedValue({
      profileComplete: true,
      adultEligible: true,
      roleTags: [],
      countryCode: "NG",
    });

    const getHandler = (NextAdRoute.options.server?.handlers as any)?.GET;
    const req = new Request(
      "https://test.local/api/public/v1/ads/next?platform=web&slot=home_banner&channelId=ch_adult",
    );
    const res = await getHandler({ request: req });
    expect(res.status).toBe(200);
    const ad = await res.json();
    // Must return null because channel is adult-restricted
    expect(ad).toBeNull();
  });

  it("enforces paid viewers ad-free option when configured", async () => {
    const { fs, storedDocs } = createMemoryFirestore();
    // Turn on paid viewers ad-free setting
    storedDocs["config/adSettings"] = { paidViewersAdFree: true };

    vi.spyOn(Firestore, "create").mockResolvedValue(fs as unknown as Firestore);
    vi.spyOn(apiModule, "requireUser").mockResolvedValue({ uid: "paid_viewer" } as any);
    vi.spyOn(apiModule, "getUserProfile").mockResolvedValue({
      profileComplete: true,
      adultEligible: true,
      roleTags: ["subscriber"],
      countryCode: "NG",
    });

    const getHandler = (NextAdRoute.options.server?.handlers as any)?.GET;
    const req = new Request(
      "https://test.local/api/public/v1/ads/next?platform=web&slot=home_banner&channelId=ch_normal",
    );
    const res = await getHandler({ request: req });
    expect(res.status).toBe(200);
    const ad = await res.json();
    // Must return null because paid viewers ad-free is true
    expect(ad).toBeNull();
  });
});
