import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiError, Firestore } from "@/lib/server/firebase-admin";
import { errorBody, parseBody } from "@/lib/server/api";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { writeAuditLog } from "@/lib/server/audit";

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "aol.com",
  "mail.com",
  "zoho.com",
  "yandex.com",
]);

function isFreeEmailDomain(email: string): boolean {
  const parts = email.toLowerCase().split("@");
  if (parts.length !== 2) return false;
  return FREE_EMAIL_DOMAINS.has(parts[1]);
}

const schema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(120),
  companyEmail: z.string().trim().email("Valid company email is required").max(254),
  country: z.string().trim().min(2, "Country is required").max(80),
  phone: z.string().trim().min(6, "Valid phone number is required").max(30),
  representative: z.string().trim().min(2, "Representative name is required").max(120),
  website: z.string().trim().max(2048).optional(),
  description: z.string().trim().min(10, "Please provide a description (min 10 characters)").max(2000),
  expectedChannels: z.string().trim().max(500).optional(),
  licencesHeld: z.string().trim().max(500).optional(),
});

export const Route = createFileRoute("/api/public/v1/partner/enquiry")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Rate limit partner enquiries: 5 per hour per IP
          await enforceRateLimit(request, "partner_enquiry", {
            maxRequests: 5,
            windowSeconds: 3600,
          });

          const body = await parseBody(request, schema);

          if (isFreeEmailDomain(body.companyEmail)) {
            throw new ApiError(
              400,
              "COMPANY_EMAIL_REQUIRED",
              "Personal or free-mail providers (Gmail, Yahoo, Outlook, Proton, etc.) are not accepted for partner enquiries. Please provide your official company domain email.",
            );
          }

          const fs = await Firestore.create();
          const enquiryId = `enq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const now = new Date().toISOString();

          const record = {
            id: enquiryId,
            companyName: body.companyName,
            companyEmail: body.companyEmail,
            country: body.country,
            phone: body.phone,
            representative: body.representative,
            website: body.website || "",
            description: body.description,
            expectedChannels: body.expectedChannels || "",
            licencesHeld: body.licencesHeld || "",
            status: "pending",
            submittedAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`partnerEnquiries/${enquiryId}`, record);

          await writeAuditLog(fs, {
            action: "partner.enquiry_submitted",
            actorId: "anonymous",
            actorEmail: body.companyEmail,
            targetId: enquiryId,
            metadata: {
              companyName: body.companyName,
              companyEmail: body.companyEmail,
              country: body.country,
            },
          });

          return Response.json(
            {
              success: true,
              message: "Request received. We will review it and notify you.",
              enquiryId,
            },
            { status: 201, headers: { "cache-control": "no-store" } },
          );
        } catch (error) {
          return errorBody(error);
        }
      },
    },
  },
});
