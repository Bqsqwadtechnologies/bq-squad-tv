import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { getPlatformFlags, publicFlags } from "@/lib/server/flags";
import { currencyForCountry } from "@/lib/server/currency";

function countryFromRequest(request: Request): string | null {
  const explicit = (request.headers.get("x-vercel-ip-country") ?? request.headers.get("x-country-code"))?.trim().toUpperCase();
  if (explicit && /^[A-Z]{2}$/.test(explicit)) return explicit;
  const language = request.headers.get("accept-language")?.split(",")[0]?.trim() ?? "";
  const match = language.match(/[-_]([A-Za-z]{2})(?:$|[-_])/);
  return match?.[1]?.toUpperCase() ?? null;
}

function currencySymbol(currency: string): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find(part => part.type === "currency")?.value ?? currency;
  } catch { return currency; }
}

export const Route = createFileRoute("/api/public/v1/config/client")({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const fs = await Firestore.create();
        const [flags, legal] = await Promise.all([
          getPlatformFlags(fs), fs.getDoc("config/legalPageVersions"),
        ]);
        const currency = currencyForCountry(countryFromRequest(request));
        const rawVersions = legal?.["versions"];
        const legalPageVersions = rawVersions && typeof rawVersions === "object" && !Array.isArray(rawVersions)
          ? Object.fromEntries(Object.entries(rawVersions as Record<string, unknown>)
              .filter(([key, value]) => ["privacy", "terms", "producerTerms", "contentPolicy"].includes(key)
                && typeof value === "string" && value.length <= 80))
          : {};
        return Response.json({
          flags: publicFlags(flags), legalPageVersions, currency, currencySymbol: currencySymbol(currency),
        }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=30" } });
      } catch {
        return Response.json({
          flags: { waitingRoom: true, maintenanceMode: true, signupsOpen: false, commentsOpen: false, newStreamGrants: false, adultChannels: false },
          legalPageVersions: {}, currency: "USD", currencySymbol: "$",
        }, { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=30" } });
      }
    },
  } },
});
