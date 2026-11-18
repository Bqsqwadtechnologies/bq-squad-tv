import { describe, it, expect } from "vitest";
import { buildMatrix, PUBLIC_ROUTE_ALLOWLIST } from "../../scripts/route-access-matrix.mjs";

describe("Route Access & Guard Matrix (Deny by Default)", () => {
  const matrix = buildMatrix();

  it("discovers all API and console routes", () => {
    expect(matrix.length).toBeGreaterThan(100);
  });

  it("contains no unguarded routes across the entire route tree", () => {
    const unguarded = matrix.filter(r => r.type === "unguarded");
    if (unguarded.length > 0) {
      const details = unguarded.map(u => `  - ${u.route} (${u.file})`).join("\n");
      throw new Error(`Found ${unguarded.length} unguarded routes:\n${details}\nEvery route must have an authenticated guard or be on the reviewed public allow-list.`);
    }
    expect(unguarded).toHaveLength(0);
  });

  it("public routes match the reviewed public allow-list exactly", () => {
    const publicRoutes = matrix.filter(r => r.type === "public").map(r => r.route);
    for (const r of publicRoutes) {
      expect(PUBLIC_ROUTE_ALLOWLIST.has(r)).toBe(true);
    }
  });

  it("console page routes are all guarded and never public", () => {
    const consoleRoutes = matrix.filter(r => 
      r.file.startsWith("src/routes/admin") || 
      r.file.startsWith("src/routes/producer") || 
      r.file.startsWith("src/routes/provider")
    );
    expect(consoleRoutes.length).toBeGreaterThanOrEqual(18);
    for (const r of consoleRoutes) {
      expect(["zillionaire module", "producer", "provider"]).toContain(r.type);
    }
  });
});
