import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Firestore } from "@/lib/server/firebase-admin";
import { ageInYears, errorBody, parseBody, requireUser } from "@/lib/server/api";

const bodySchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfBirth must be YYYY-MM-DD"),
  parentalPin: z.string().regex(/^\d{4,8}$/, "parentalPin must be 4-8 digits").nullable().optional(),
});

async function hashPin(pin: string, uid: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`bq-sqwad-tv:parental-pin:${uid}:${pin}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/api/public/v1/profile/complete")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const user = await requireUser(request);
          const body = await parseBody(request, bodySchema);
          // Age is always derived on the server; client-supplied age is never trusted.
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
            fields["parentalPinHash"] = await hashPin(body.parentalPin, user.uid);
          }
          await fs.patchDoc(`users/${user.uid}`, fields);
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
