import { createFileRoute } from "@tanstack/react-router";
import { errorBody } from "@/lib/server/api";
import { requireProvider } from "@/lib/server/access";

export const Route = createFileRoute("/api/public/v1/provider/channels")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { fs, providerId, user } = await requireProvider(request);
          const body = (await request.json().catch(() => ({}))) as {
            name?: string;
            slug?: string;
            description?: string;
            categories?: string[];
            language?: string;
            country?: string;
            logoUrl?: string;
            bannerUrl?: string;
            ageRating?: string;
            adultOnly?: boolean;
            contentType?: string;
            streamType?: string;
            streamUrl?: string;
            backupStreamUrl?: string;
            bandwidthCapGbps?: number;
            technicalDetails?: {
              videoCodec?: string;
              audioCodec?: string;
              bitrateKbps?: number;
              resolution?: string;
              frameRate?: number;
              latencyTarget?: string;
            };
            rightsEvidence?: {
              licenceNumber?: string;
              licenceContractUrl?: string;
              territories?: string[];
              licenceExpiresAt?: string;
            };
            contact?: {
              supportEmail?: string;
              supportPhone?: string;
            };
            policyConfirmed?: boolean;
            testStreamConfirmed?: boolean;
          };

          const name = (body.name || "").trim();
          if (!name || name.length < 2) {
            return Response.json(
              { error: "Channel name is required (min 2 characters)" },
              { status: 400 },
            );
          }

          if (body.policyConfirmed !== true) {
            return Response.json(
              { error: "You must confirm the Content Policy and Brand Safety declaration." },
              { status: 400 },
            );
          }

          const streamUrl = (body.streamUrl || "").trim();
          if (!streamUrl || !streamUrl.startsWith("https://") || !/\.m3u8(?:$|[?#])/i.test(streamUrl)) {
            return Response.json(
              { error: "A valid HTTPS HLS stream URL ending in .m3u8 is required." },
              { status: 400 },
            );
          }

          if (
            !body.rightsEvidence ||
            (!body.rightsEvidence.licenceNumber && !body.rightsEvidence.licenceContractUrl)
          ) {
            return Response.json(
              { error: "Rights proof (licence number or contract URL) is required before submitting a live stream." },
              { status: 400 },
            );
          }

          const channelId = "chan_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
          const slug = (body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).slice(0, 50);
          const now = new Date().toISOString();
          const categories =
            Array.isArray(body.categories) && body.categories.length > 0
              ? body.categories
              : ["General"];
          const language = (body.language || "en").trim();
          const country = (body.country || "NG").trim().toUpperCase();
          const bandwidthCapGbps =
            Number(body.bandwidthCapGbps) > 0 ? Number(body.bandwidthCapGbps) : 8.0;

          const channelDoc = {
            id: channelId,
            channelId,
            providerId,
            createdByUid: user.uid,
            name,
            slug,
            description: body.description || "",
            categories,
            language,
            country,
            status: "in_review",
            approvalStatus: "submitted",
            streamStatus: "OFFLINE",
            isLive: false,
            published: false,
            health: "healthy",
            bandwidthCapGbps,
            logoUrl: body.logoUrl || null,
            bannerUrl: body.bannerUrl || null,
            ageRating: body.ageRating || "PG",
            adultOnly: Boolean(body.adultOnly),
            contentType: body.contentType || "live",
            streamType: body.streamType || "hls_pull",
            streamUrl: body.streamUrl || "",
            backupStreamUrl: body.backupStreamUrl || null,
            technicalDetails: body.technicalDetails || {
              videoCodec: "H.264",
              audioCodec: "AAC",
              bitrateKbps: 4500,
              resolution: "1080p",
              frameRate: 60,
              latencyTarget: "standard",
            },
            rightsEvidence: body.rightsEvidence || {
              licenceNumber: "",
              territories: ["NG"],
              licenceExpiresAt: null,
            },
            contact: body.contact || {
              supportEmail: user.email,
              supportPhone: "",
            },
            policyConfirmed: true,
            testStreamConfirmed: Boolean(body.testStreamConfirmed),
            currentProgramme: "Submission In Review",
            currentViewers: 0,
            totalWatchMinutes: 0,
            createdAt: now,
            updatedAt: now,
          };

          await fs.setDoc(`liveChannels/${channelId}`, channelDoc);

          // Create approval ticket in approvals collection for Zillionaire review
          const approvalId = "approval_" + channelId;
          const deadline = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
          await fs.setDoc(`approvals/${approvalId}`, {
            id: approvalId,
            type: "channel_submission",
            title: `Channel Submission: ${name}`,
            sourceCollection: "liveChannels",
            sourceId: channelId,
            providerId,
            submitterUid: user.uid,
            submitterEmail: user.email,
            status: "pending",
            priority: "high",
            slaDeadline: deadline,
            checklist: {
              policyChecked: false,
              rightsEvidenceChecked: false,
              technicalTestPassed: false,
              artworkApproved: false,
            },
            details: {
              channelName: name,
              slug,
              categories,
              language,
              streamType: body.streamType || "hls_pull",
              streamUrl: body.streamUrl || "",
              ageRating: body.ageRating || "PG",
              adultOnly: Boolean(body.adultOnly),
            },
            createdAt: now,
            updatedAt: now,
          });

          // Audit log
          const auditId = crypto.randomUUID();
          await fs.setDoc(`auditLog/${auditId}`, {
            actorUid: user.uid,
            action: "channel.submitted_for_approval",
            targetId: channelId,
            providerId,
            channelName: name,
            createdAt: now,
          });

          return Response.json(
            {
              success: true,
              channelId,
              channel: channelDoc,
              message:
                "Channel submitted successfully. It is currently under review by the platform team and will go live once approved.",
            },
            { status: 201 },
          );
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      PATCH: async ({ request }) => {
        try {
          const { fs, providerId } = await requireProvider(request);
          const body = (await request.json()) as { channelId?: string; bandwidthCapGbps?: number };
          if (!body.channelId || typeof body.bandwidthCapGbps !== "number") {
            return Response.json({ error: "Invalid parameters" }, { status: 400 });
          }
          await fs
            .updateDoc(`liveChannels/${body.channelId}`, {
              bandwidthCapGbps: body.bandwidthCapGbps,
              updatedAt: new Date().toISOString(),
            })
            .catch(() => null);
          return Response.json({ success: true, bandwidthCapGbps: body.bandwidthCapGbps });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
      GET: async ({ request }) => {
        try {
          const { fs, providerId } = await requireProvider(request);

          const providerChannels = await fs.query("liveChannels", {
            filters: [{ field: "providerId", op: "EQUAL", value: providerId }],
            limit: 100,
          });

          const channels = providerChannels.map((c) => ({
            id: c.__id || c["channelId"] || c["id"],
            name: c["name"] || "Live Channel",
            slug: c["slug"] || "",
            logoUrl: c["logoUrl"] || null,
            bannerUrl: c["bannerUrl"] || null,
            categories: Array.isArray(c["categories"]) ? c["categories"] : [],
            language: c["language"] || "en",
            status: c["status"] || "in_review",
            health: c["health"] || "healthy",
            currentProgramme: c["currentProgramme"] || "Broadcast Stream",
            currentViewers: Number(c["currentViewers"] || 0),
            totalWatchMinutes: Number(c["totalWatchMinutes"] || 0),
            licenceExpiresAt: c["licenceExpiresAt"] || null,
            bandwidthCapGbps: Number(c["bandwidthCapGbps"] || 8.0),
            streamType: c["streamType"] || "hls_pull",
            streamUrl: c["streamUrl"] || "",
            errorLogs:
              Array.isArray(c["errorLogs"]) && c["errorLogs"].length > 0
                ? c["errorLogs"]
                : [],
          }));

          return Response.json({ channels });
        } catch (err: unknown) {
          return errorBody(err);
        }
      },
    },
  },
});
