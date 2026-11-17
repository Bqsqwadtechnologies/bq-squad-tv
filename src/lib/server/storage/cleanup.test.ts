import { describe, expect, it } from "vitest";
import { confirmOrphanDeletion, isExpiredTemporaryObject, sourceCanBeDeleted } from "./cleanup";

describe("storage cleanup safety", () => {
  it("requires two separated orphan observations before deletion", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    expect(confirmOrphanDeletion({ key: "orphan.ts", firstSeenAt: "2026-11-16T00:00:00Z" }, now)).toBe(false);
    expect(confirmOrphanDeletion({ key: "orphan.ts", firstSeenAt: "2026-11-15T00:00:00Z", confirmingRunAt: "2026-11-16T00:00:00Z" }, now)).toBe(true);
  });
  it("expires temporary files after 24 hours", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    expect(isExpiredTemporaryObject("2026-11-15T00:00:00Z", now)).toBe(true);
    expect(isExpiredTemporaryObject("2026-11-16T12:00:00Z", now)).toBe(false);
  });
  it("keeps source files pinned or inside the seven-day grace period", () => {
    const now = Date.parse("2026-11-17T00:00:00Z");
    expect(sourceCanBeDeleted({ publishedAt: "2026-11-01T00:00:00Z", pinned: true }, now)).toBe(false);
    expect(sourceCanBeDeleted({ publishedAt: "2026-11-15T00:00:00Z" }, now)).toBe(false);
    expect(sourceCanBeDeleted({ publishedAt: "2026-11-01T00:00:00Z" }, now)).toBe(true);
  });
});
