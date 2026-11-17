import { describe, expect, it, vi } from "vitest";
import { discoverStorageDestinations } from "./discovery";

describe("storage discovery", () => {
  it("discovers item bundles by explicit destination id and shared project buckets", async () => {
    const result = await discoverStorageDestinations({
      STORAGE_LOV_BUNDLE_01: JSON.stringify({
        items: [
          { destinationId: "lov-001", bucket: "bucket-one", url: "https://project-a.supabase.co", serviceRoleKey: "private-one" },
          { destinationId: "lov-002", bucket: "bucket-two", url: "https://project-a.supabase.co", serviceRoleKey: "private-two" },
        ],
      }),
      STORAGE_LOV_BUNDLE_02: JSON.stringify({
        url: "https://project-b.supabase.co", serviceRoleKey: "private-three",
        buckets: ["bucket-three", "bucket-four"],
      }),
      STORAGE_B2_01_KEY_ID: "incomplete-b2",
    });
    expect(result.counts.lovable).toBe(4);
    expect(result.counts.backblaze).toBe(0);
    expect(result.destinations.map(item => item.destinationId)).toEqual([
      "lov-001", "lov-002", "lov-bucket-three", "lov-bucket-four",
    ]);
    expect(new Set(result.destinations.slice(0, 2).map(item => item.accountGroup)).size).toBe(1);
    expect(result.destinations[0]?.accountGroup).not.toBe(result.destinations[2]?.accountGroup);
    expect(result.destinations.every(item => item.paidEgressEnabled === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private-one");
    expect(JSON.stringify(result)).not.toContain("project-a.supabase.co");
  });

  it("discovers a numbered Backblaze account without returning credentials", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        apiUrl: "https://api001.backblazeb2.com",
        authorizationToken: "provider-session-token",
        accountId: "account-id",
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        buckets: [{ bucketId: "bucket-id-01", bucketName: "bq-streams-01" }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const result = await discoverStorageDestinations({
        STORAGE_B2_01_KEY_ID: "private-key-id",
        STORAGE_B2_01_APP_KEY: "private-app-key",
        STORAGE_B2_01_BUCKET_ID: "bucket-id-01",
        STORAGE_B2_01_ENDPOINT: "https://s3.us-west-004.backblazeb2.com",
      });
      expect(result.counts.backblaze).toBe(1);
      expect(result.destinations[0]?.bucketName).toBe("bq-streams-01");
      expect(result.destinations[0]?.region).toBe("us-west-004");
      expect(JSON.stringify(result)).not.toContain("private-app-key");
      expect(JSON.stringify(result)).not.toContain("provider-session-token");
    } finally {
      vi.stubGlobal("fetch", originalFetch);
    }
  });

  it("returns only destinations not already registered and reports the skipped count", async () => {
    const result = await discoverStorageDestinations({
      STORAGE_LOV_BUNDLE_01: JSON.stringify({
        items: [
          { destinationId: "lov-001", bucket: "bucket-one", url: "https://project-a.supabase.co", serviceRoleKey: "private-one" },
          { destinationId: "lov-002", bucket: "bucket-two", url: "https://project-a.supabase.co", serviceRoleKey: "private-two" },
        ],
      }),
    }, new Set(["lov-001"]));
    expect(result.counts.skippedRegistered).toBe(1);
    expect(result.destinations.map(item => item.destinationId)).toEqual(["lov-002"]);
  });

  it("discovers all 326 buckets from one shared project bundle", async () => {
    const buckets = Array.from({ length: 326 }, (_, index) => "bucket-" + String(index + 1).padStart(3, "0"));
    const result = await discoverStorageDestinations({
      STORAGE_LOV_BUNDLE_01: JSON.stringify({
        url: "https://project-a.supabase.co",
        serviceRoleKey: "private-key",
        buckets,
      }),
    });
    expect(result.counts.lovable).toBe(326);
    expect(result.destinations).toHaveLength(326);
    expect(new Set(result.destinations.map(item => item.accountGroup)).size).toBe(1);
    expect(JSON.stringify(result)).not.toContain("private-key");
    expect(JSON.stringify(result)).not.toContain("project-a.supabase.co");
  });

  it("ignores malformed bundles and enforces the 500-bucket bound", async () => {
    const result = await discoverStorageDestinations({
      STORAGE_LOV_BUNDLE_01: "{not-json",
      STORAGE_LOV_BUNDLE_02: JSON.stringify({
        url: "https://project-b.supabase.co", serviceRoleKey: "private-three",
        buckets: Array.from({ length: 501 }, (_, i) => "bucket-" + i),
      }),
    });
    expect(result.destinations).toEqual([]);
    expect(result.counts.total).toBe(0);
  });
});
