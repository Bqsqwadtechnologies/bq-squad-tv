import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { ageInYears, errorBody, parseBody, requireUser } from "@/lib/server/api";
import { hashParentalPin } from "@/lib/server/parental-pin";
import { currencyForCountry, normalizeCountryCode } from "@/lib/server/currency";
import { ApiError } from "@/lib/server/firebase-admin";

const bodySchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD"),
  parentalPin: z.string().regex(/^\d{4,8}$/, "parentalPin must be 4-8 digits").nullable().optional(),
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
          if (existingWallet && nextCountry && existingCurrency && currencyForCountry(nextCountry) !== existingCurrency) {
            throw new ApiError(409, "WALLET_CURRENCY_LOCKED", "Your wallet currency is already established and cannot be changed by changing your country.");
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
            ...(nextCountry && !existingWallet ? { preferredCurrency: currencyForCountry(nextCountry) } : {}),
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
            ...(nextCountry ? { countryCode: nextCountry, currency: existingCurrency ?? currencyForCountry(nextCountry) } : { currency: existingCurrency ?? "USD" }),
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
