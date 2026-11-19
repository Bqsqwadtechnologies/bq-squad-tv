import { createFileRoute } from "@tanstack/react-router";
import { Firestore } from "@/lib/server/firebase-admin";
import { getPlatformFlags, publicFlags } from "@/lib/server/flags";
import { currencyForCountry } from "@/lib/server/currency";
import { getPlatformSettings } from "@/lib/server/platform-settings";

function countryFromRequest(request: Request): string | null {
  const explicit = (
    request.headers.get("x-vercel-ip-country") ?? request.headers.get("x-country-code")
  )
    ?.trim()
    .toUpperCase();
  if (explicit && /^[A-Z]{2}$/.test(explicit)) return explicit;
  const language = request.headers.get("accept-language")?.split(",")[0]?.trim() ?? "";
  const match = language.match(/[-_]([A-Za-z]{2})(?:$|[-_])/);
  return match?.[1]?.toUpperCase() ?? null;
}

function currencySymbol(currency: string): string {
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
        .formatToParts(0)
        .find((part) => part.type === "currency")?.value ?? currency
    );
  } catch {
    return currency;
  }
}

export const Route = createFileRoute("/api/public/v1/config/client")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const fs = await Firestore.create();
          const [flags, legal, settings] = await Promise.all([
            getPlatformFlags(fs),
            fs.getDoc("config/legalPageVersions"),
            getPlatformSettings(fs),
          ]);

          const detectedCountry = countryFromRequest(request);
          const currency = currencyForCountry(detectedCountry);

          const rawVersions = legal?.["versions"];
          const legalPageVersions =
            rawVersions && typeof rawVersions === "object" && !Array.isArray(rawVersions)
              ? Object.fromEntries(
                  Object.entries(rawVersions as Record<string, unknown>).filter(
                    ([key, value]) =>
                      ["privacy", "terms", "producerTerms", "contentPolicy"].includes(key) &&
                      typeof value === "string" &&
                      value.length <= 80,
                  ),
                )
              : {
                  terms: settings.termsVersion,
                  privacy: settings.privacyVersion,
                  producerTerms: settings.producerTermsVersion,
                };

          const pFlags = publicFlags(flags);
          if (settings.maintenanceMode) {
            pFlags.maintenanceMode = true;
          }

          return Response.json(
            {
              flags: pFlags,
              legalPageVersions,
              currency,
              currencySymbol: currencySymbol(currency),
              maintenance: {
                active: settings.maintenanceMode,
                message: settings.maintenanceMessage,
                endsAt: settings.maintenanceEndsAt,
              },
              announcement: settings.announcementEnabled
                ? {
                    enabled: true,
                    text: settings.announcementText,
                    type: settings.announcementType,
                    link: settings.announcementLink,
                    linkLabel: settings.announcementLinkLabel,
                    dismissible: settings.announcementDismissible,
                  }
                : {
                    enabled: false,
                    text: "",
                    type: "info",
                    link: "",
                    linkLabel: "",
                    dismissible: true,
                  },
              appVersion: {
                minAndroidVersionCode: settings.minAndroidVersionCode,
                latestAndroidVersionCode: settings.latestAndroidVersionCode,
                versionName: settings.androidVersionName,
                forceUpdateAndroid: settings.forceUpdateAndroid,
                androidUpdateUrl: settings.androidUpdateUrl,
              },
              commerce: {
                defaultCurrency: settings.defaultCurrency,
                supportedCurrencies: settings.supportedCurrencies,
                defaultRatePerMinuteMinor: settings.defaultRatePerMinuteMinor,
                minimumSessionBalanceMinor: settings.minimumSessionBalanceMinor,
              },
            },
            { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=30" } },
          );
        } catch {
          return Response.json(
            {
              flags: {
                waitingRoom: true,
                maintenanceMode: true,
                signupsOpen: false,
                commentsOpen: false,
                newStreamGrants: false,
                adultChannels: false,
              },
              legalPageVersions: {},
              currency: "USD",
              currencySymbol: "$",
              maintenance: {
                active: true,
                message: "Scheduled maintenance in progress.",
                endsAt: null,
              },
              announcement: { enabled: false, text: "", type: "info", link: "", linkLabel: "", dismissible: true },
              appVersion: {
                minAndroidVersionCode: 1,
                latestAndroidVersionCode: 1,
                versionName: "1.0.0",
                forceUpdateAndroid: false,
                androidUpdateUrl: "",
              },
              commerce: {
                defaultCurrency: "USD",
                supportedCurrencies: ["USD"],
                defaultRatePerMinuteMinor: 500,
                minimumSessionBalanceMinor: 2500,
              },
            },
            { headers: { "cache-control": "public, max-age=60, stale-while-revalidate=30" } },
          );
        }
      },
    },
  },
});
