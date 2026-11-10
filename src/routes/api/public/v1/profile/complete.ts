import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { ageInYears, errorBody, parseBody, requireUser } from "@/lib/server/api";
import { hashParentalPin } from "@/lib/server/parental-pin";

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
          const fields: Record<string, unknown> = {
            email: user.email,
            dateOfBirth: body.dateOfBirth,
            profileComplete: true,
            adultEligible,
            parentalPinEnabled: typeof body.parentalPin === "string",
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
            adultEligible,
            parentalPinEnabled: typeof body.parentalPin === "string",
          });
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
