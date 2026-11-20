import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export function normalizeApiPath(urlStr: string): { normalizedUrl: string; hasTrailingSlash: boolean } {
  const url = new URL(urlStr);
  const hasTrailingSlash = url.pathname.length > 1 && url.pathname.endsWith("/");
  if (url.pathname.startsWith("/api/") && hasTrailingSlash) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return { normalizedUrl: url.toString(), hasTrailingSlash };
}

// Hosting compresses every response at the edge. Never compress a body (gzip, brotli,
// CompressionStream) or set content-encoding here or in a server route: the body gets encoded
// twice and renders garbled.
export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const url = new URL(request.url);

      // Support both /path and /path/ for all API routes transparently
      if (url.pathname.startsWith("/api/")) {
        let reqToTry = request;
        let altReq: Request | undefined;
        try {
          if (url.pathname.length > 5 && url.pathname.endsWith("/")) {
            const stripped = new URL(url.toString());
            stripped.pathname = url.pathname.slice(0, -1);
            reqToTry = new Request(stripped.toString(), request.clone());
            altReq = request;
          } else if (!url.pathname.endsWith("/")) {
            const slashed = new URL(url.toString());
            slashed.pathname = `${url.pathname}/`;
            altReq = new Request(slashed.toString(), request.clone());
          }
        } catch {
          reqToTry = request;
          altReq = undefined;
        }

        let response = await handler.fetch(reqToTry, env, ctx);
        if (response.status === 404 && altReq) {
          try {
            const altResponse = await handler.fetch(altReq, env, ctx);
            if (altResponse.status !== 404) {
              response = altResponse;
            }
          } catch {
            // keep primary response
          }
        }
        return await normalizeCatastrophicSsrResponse(response);
      }

      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
