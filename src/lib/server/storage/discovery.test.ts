import { describe, expect, it } from "vitest";
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

  it("ignores malformed bundles and enforces the 25-bucket bound", async () => {
    const result = await discoverStorageDestinations({
      STORAGE_LOV_BUNDLE_01: "{not-json",
      STORAGE_LOV_BUNDLE_02: JSON.stringify({
        url: "https://project-b.supabase.co", serviceRoleKey: "private-three",
        buckets: Array.from({ length: 26 }, (_, i) => "bucket-" + i),
      }),
    });
    expect(result.destinations).toEqual([]);
    expect(result.counts.total).toBe(0);
  });
});
