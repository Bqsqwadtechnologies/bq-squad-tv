import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { ageInYears, errorBody, parseBody, requireUser } from "@/lib/server/api";
import { hashParentalPin } from "@/lib/server/parental-pin";
import { currencyForCountry, normalizeCountryCode } from "@/lib/server/currency";
import { writeAuditLog } from "@/lib/server/audit";
import { liveSessionLeases } from "@/lib/server/session-limits";
import { assertLegalAcceptance } from "@/lib/server/legal-acceptance";

const bodySchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD"),
  parentalPin: z.string().regex(/^\d{4,8}$/, "parentalPin must be 4-8 digits").nullable().optional(),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).optional(),
});

export const Route = createFileRoute("/api/public/v1/profile/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          const adultEligible = ageInYears(body.dateOfBirth) >= 18;
          const fs = await Firestore.create();
          await assertLegalAcceptance(fs, user.uid, "public");
          const existingProfile = await fs.getDoc("users/" + user.uid);
          const existingWallet = await fs.getDoc("wallets/" + user.uid);
          const requestedCountry = body.countryCode ? normalizeCountryCode(body.countryCode) : null;
          if (body.countryCode && !requestedCountry) {
            throw new ApiError(400, "COUNTRY_CODE_INVALID", "Choose a valid two-letter country code.");
          }
          const currentCountry = normalizeCountryCode(existingProfile?.["countryCode"]);
          const nextCountry = requestedCountry ?? currentCountry;
          const existingCurrency = typeof existingWallet?.["currency"] === "string"
            ? existingWallet["currency"] as string
            : existingWallet ? "NGN" : null;
          const nextCurrency = nextCountry ? currencyForCountry(nextCountry) : existingCurrency ?? "USD";
          const currencyChanging = Boolean(existingWallet && existingCurrency && nextCurrency !== existingCurrency);
          if (currencyChanging) {
            const balance = typeof existingWallet?.["balanceMinor"] === "number" ? existingWallet["balanceMinor"] as number : 0;
            const held = ["heldMinor", "heldBalanceMinor", "holdsMinor"].reduce((sum, key) =>
              sum + (typeof existingWallet?.[key] === "number" && Number.isSafeInteger(existingWallet[key]) ? existingWallet[key] as number : 0), 0);
            const activeSessions = await fs.getDoc("activeSessions/" + user.uid);
            const activeSessionIds = Object.keys(liveSessionLeases(activeSessions?.["sessions"], Date.now()));
            if (balance !== 0 || held !== 0 || activeSessionIds.length > 0) {
              throw new ApiError(409, "WALLET_CURRENCY_LOCKED", "Your wallet currency can change only when your balance is zero and no viewing sessions or held funds remain. Learn more in Wallet help.");
            }
            await fs.patchDoc("wallets/" + user.uid, { currency: nextCurrency, updatedAt: new Date().toISOString() });
            await writeAuditLog(fs, {
              actorUid: user.uid, action: "wallet.currency.changed",
              targetType: "wallet", targetId: user.uid,
              reason: "Viewer changed account country while the wallet had no balance, holds or active sessions",
              metadata: { fromCurrency: existingCurrency, toCurrency: nextCurrency },
            });
          }
          if (!existingWallet) {
            await fs.setDoc("wallets/" + user.uid, {
              balanceMinor: 0, currency: nextCurrency, dailySpendLimitMinor: null,
              spentTodayMinor: 0, updatedAt: new Date().toISOString(),
            }, { mustNotExist: true }).catch(async error => {
              if (!(error instanceof ApiError) || error.status !== 409) throw error;
            });
          }
          const sameVerifiedDateOfBirth = existingProfile?.["dateOfBirth"] === body.dateOfBirth;
          const adultAgeVerified = adultEligible && sameVerifiedDateOfBirth &&
            existingProfile?.["adultAgeVerified"] === true;
          const adultIdentityVerified = adultEligible && sameVerifiedDateOfBirth &&
            existingProfile?.["adultIdentityVerified"] === true;
          const verifiedAdultEligible = adultEligible && adultAgeVerified && adultIdentityVerified;
          const fields: Record<string, unknown> = {
            email: user.email,
            dateOfBirth: body.dateOfBirth,
            ...(nextCountry ? { countryCode: nextCountry } : {}),
            profileComplete: true,
            adultAgeVerified,
            adultIdentityVerified,
            adultEligible: verifiedAdultEligible,
            parentalPinEnabled: typeof body.parentalPin === "string",
            ...(nextCountry ? { preferredCurrency: nextCurrency } : {}),
            updatedAt: new Date().toISOString(),
          };
          if (typeof body.parentalPin === "string") {
            const pinHash = await hashParentalPin(body.parentalPin);
            fields["parentalPinHash"] = pinHash.hash;
            fields["parentalPinHashVersion"] = pinHash.version;
            fields["parentalPinSalt"] = pinHash.salt;
          } else {
            fields["parentalPinHash"] = null;
            fields["parentalPinHashVersion"] = null;
            fields["parentalPinSalt"] = null;
          }
          await fs.patchDoc("users/" + user.uid, fields);
          return Response.json({
            profileComplete: true,
            adultEligible: verifiedAdultEligible,
            parentalPinEnabled: typeof body.parentalPin === "string",
            ...(nextCountry ? { countryCode: nextCountry, currency: nextCurrency } : { currency: existingCurrency ?? "USD" }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
