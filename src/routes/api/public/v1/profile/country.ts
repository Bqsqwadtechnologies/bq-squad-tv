import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody, requireUser } from "@/lib/server/api";
import { currencyForCountry, normalizeCountryCode } from "@/lib/server/currency";
import { detectCountryFromRequest } from "@/lib/server/country-detection";
import { resolvePlatformAccess } from "@/lib/server/roles";
import { liveSessionLeases } from "@/lib/server/session-limits";
import { writeAuditLog } from "@/lib/server/audit";

const countrySchema = z.object({
  countryCode: z.string().regex(/^[A-Za-z]{2}$/),
});

export const Route = createFileRoute("/api/public/v1/profile/country")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const fs = await Firestore.create();
          const [profile, wallet] = await Promise.all([
            fs.getDoc("users/" + user.uid),
            fs.getDoc("wallets/" + user.uid),
          ]);
          const access = await resolvePlatformAccess(
            fs, user.uid, user.email, user.customClaims, user.emailVerified === true,
          );
          let countryCode = normalizeCountryCode(profile?.["countryCode"]);
          if (!countryCode) {
            countryCode = await detectCountryFromRequest(request);
            if (countryCode) {
              await fs.patchDoc("users/" + user.uid, {
                countryCode,
                preferredCurrency: currencyForCountry(countryCode),
                countryDetectionSource: "ip",
                countryDetectedAt: new Date().toISOString(),
              });
            }
          }
          const currency =
            typeof wallet?.["currency"] === "string"
              ? (wallet["currency"] as string)
              : currencyForCountry(countryCode);
          return Response.json(
            { countryCode, currency, walletCurrencyLocked: Boolean(wallet), isZillionaireOwner: access.isZillionaireOwner, countrySource: countryCode ? "account_or_ip" : "unavailable" },
            { headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, countrySchema);
          const nextCountry = normalizeCountryCode(body.countryCode);
          if (!nextCountry) {
            throw new ApiError(400, "COUNTRY_CODE_INVALID", "Choose a valid two-letter country code.");
          }
          const fs = await Firestore.create();
          const access = await resolvePlatformAccess(
            fs, user.uid, user.email, user.customClaims, user.emailVerified === true,
          );
          if (!access.isZillionaireOwner) {
            throw new ApiError(403, "COUNTRY_AUTO_SELECTED", "Your country is selected automatically from your IP address.");
          }

          const nextCurrency = currencyForCountry(nextCountry);
          const wallet = await fs.getDoc("wallets/" + user.uid);
          if (wallet) {
            const currentCurrency = typeof wallet["currency"] === "string" ? wallet["currency"] as string : "NGN";
            const balance = typeof wallet["balanceMinor"] === "number" ? wallet["balanceMinor"] as number : 0;
            const held = ["heldMinor", "heldBalanceMinor", "holdsMinor"].reduce(
              (sum, key) => sum + (typeof wallet[key] === "number" && Number.isSafeInteger(wallet[key]) ? wallet[key] as number : 0), 0,
            );
            const activeSessions = await fs.getDoc("activeSessions/" + user.uid);
            const activeIds = Object.keys(liveSessionLeases(activeSessions?.["sessions"], Date.now()));
            if (currentCurrency !== nextCurrency && (balance !== 0 || held !== 0 || activeIds.length > 0)) {
              throw new ApiError(409, "WALLET_CURRENCY_LOCKED", "The owner test currency can change only when the wallet balance, holds and active sessions are all zero.");
            }
            if (currentCurrency !== nextCurrency) {
              await fs.patchDoc("wallets/" + user.uid, { currency: nextCurrency, updatedAt: new Date().toISOString() });
            }
          }
          const previousCountry = normalizeCountryCode((await fs.getDoc("users/" + user.uid))?.["countryCode"]);
          await fs.patchDoc("users/" + user.uid, {
            countryCode: nextCountry,
            preferredCurrency: nextCurrency,
            countryDetectionSource: "owner_test_override",
            countryUpdatedAt: new Date().toISOString(),
          });
          await writeAuditLog(fs, {
            actorUid: user.uid,
            action: "owner.country.test_override",
            targetType: "user",
            targetId: user.uid,
            reason: "Zillionaire owner changed personal country for testing",
            metadata: { fromCountry: previousCountry, toCountry: nextCountry, currency: nextCurrency },
          });
          return Response.json({ countryCode: nextCountry, currency: nextCurrency }, { headers: { "cache-control": "no-store" } });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
