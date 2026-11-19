import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!["node_modules", ".git", "dist", "build"].includes(entry.name)) {
        files.push(...(await walk(full)));
      }
    } else if (entry.isFile() && /\.(tsx|jsx|html|md|txt)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractUserVisibleStrings(content: string, relativePath: string): string[] {
  const source = ts.createSourceFile(
    relativePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const visibleStrings: string[] = [];
  const visibleAttributes = new Set([
    "title",
    "aria-label",
    "aria-description",
    "placeholder",
    "alt",
    "label",
    "description",
    "subject",
  ]);

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (text) visibleStrings.push(text);
    } else if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.getText(source))) {
      const value = node.initializer;
      if (value && ts.isStringLiteral(value)) {
        visibleStrings.push(value.text);
      } else if (
        value &&
        ts.isJsxExpression(value) &&
        value.expression &&
        ts.isStringLiteral(value.expression)
      ) {
        visibleStrings.push(value.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return visibleStrings;
}

describe("Zero-Admin Naming Enforcement & Single Owner Checklist", () => {
  it("ensures no route path contains /admin as a live destination", async () => {
    const routeTreeFile = path.join(root, "src", "routeTree.gen.ts");
    const content = await readFile(routeTreeFile, "utf-8");

    // Match all route path definitions in TanStack router
    const routePathMatches = [...content.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);

    const forbiddenAdminRoutes = routePathMatches.filter(
      (p) => p === "/admin" || p.startsWith("/admin/"),
    );

    expect(
      forbiddenAdminRoutes,
      `Forbidden admin routes discovered in router: ${forbiddenAdminRoutes.join(", ")}`,
    ).toEqual([]);
  });

  it("ensures the words 'admin' and 'administrator' do not appear in user-visible UI text or headers", async () => {
    const targetDirs = [path.join(root, "src", "routes"), path.join(root, "src", "components")];

    const violations: string[] = [];
    const adminWordRegex = /\b(admin|administrator)s?\b/i;

    for (const dir of targetDirs) {
      const files = await walk(dir);
      for (const file of files) {
        const relative = path.relative(root, file).split(path.sep).join("/");

        // Skip internal error beacon or API implementations
        if (relative.startsWith("src/routes/api/")) continue;

        const content = await readFile(file, "utf-8");
        const visibleStrings = extractUserVisibleStrings(content, relative);

        for (const str of visibleStrings) {
          if (adminWordRegex.test(str)) {
            // Check if it is an explicit 404 parity check text or security deny banner
            if (
              str.includes("404") ||
              str.includes("Page Not Found") ||
              str.includes("Not Found")
            ) {
              continue;
            }
            violations.push(`${relative}: "${str}"`);
          }
        }
      }
    }

    expect(
      violations,
      `Found user-visible occurrences of 'admin' or 'administrator':\n${violations.join("\n")}`,
    ).toEqual([]);
  });

  it("verifies single owner checklist: requires ZILLIONAIRE_EMAIL and forbids ADMIN_EMAIL fallback", async () => {
    const rolesPath = path.join(root, "src", "lib", "server", "roles.ts");
    const rolesCode = await readFile(rolesPath, "utf-8");

    // Must check ZILLIONAIRE_EMAIL
    expect(rolesCode).toContain("ZILLIONAIRE_EMAIL");

    // Must NOT check ADMIN_EMAIL as fallback
    expect(rolesCode).not.toContain("process.env.ADMIN_EMAIL");
    expect(rolesCode).not.toContain("process.env['ADMIN_EMAIL']");
  });
});
