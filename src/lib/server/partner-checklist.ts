import { validateExternalUrlSafe, runChannelPreflightTests } from "./channel-auto-tests";

export type ChecklistItemStatus = "Done" | "Waiting for review" | "Needs attention";

export interface ChannelChecklistItem {
  key: string;
  title: string;
  description: string;
  status: ChecklistItemStatus;
  detail?: string;
  actionRequired?: string;
}

export interface ChannelIntegrationChecklist {
  channelId: string;
  channelName: string;
  contentOwnerCompany: string; // The partner company
  platformCreator: string; // "BQ SQWAD TV"
  canGoLive: boolean;
  overallStatus: "Ready to Go Live" | "Review in Progress" | "Action Required";
  items: ChannelChecklistItem[];
  autoTestReport: ReturnType<typeof runChannelPreflightTests>;
}

export function computeChannelChecklist(channel: Record<string, unknown>): ChannelIntegrationChecklist {
  const channelId = String(channel["id"] || channel["channelId"] || "");
  const channelName = String(channel["name"] || "Untitled Channel");
  const contentOwnerCompany = String(
    channel["partnerCompanyName"] || channel["partnerName"] || channel["ownerCompanyName"] || "Licensed Broadcast Partner",
  );
  const platformCreator = "BQ SQWAD TV";

  const autoTests = runChannelPreflightTests(channel);
  const items: ChannelChecklistItem[] = [];

  // 1. Partner Privacy Policy Link
  const privacyUrl = typeof channel["partnerPrivacyUrl"] === "string" ? channel["partnerPrivacyUrl"].trim() : "";
  if (!privacyUrl) {
    items.push({
      key: "privacy_link",
      title: "Partner Privacy Policy Link",
      description: "Mandatory public HTTPS link to your company privacy policy.",
      status: "Needs attention",
      actionRequired: "Enter your official HTTPS privacy policy URL.",
    });
  } else {
    const check = validateExternalUrlSafe(privacyUrl);
    if (!check.valid) {
      items.push({
        key: "privacy_link",
        title: "Partner Privacy Policy Link",
        description: "Mandatory public HTTPS link to your company privacy policy.",
        status: "Needs attention",
        detail: check.error,
        actionRequired: "Provide a valid public HTTPS link.",
      });
    } else if (channel["partnerPrivacyApproved"] === true) {
      items.push({
        key: "privacy_link",
        title: "Partner Privacy Policy Link",
        description: "Mandatory public HTTPS link to your company privacy policy.",
        status: "Done",
        detail: privacyUrl,
      });
    } else {
      items.push({
        key: "privacy_link",
        title: "Partner Privacy Policy Link",
        description: "Mandatory public HTTPS link to your company privacy policy.",
        status: "Waiting for review",
        detail: privacyUrl,
      });
    }
  }

  // 2. Partner Terms Link
  const termsUrl = typeof channel["partnerTermsUrl"] === "string" ? channel["partnerTermsUrl"].trim() : "";
  if (!termsUrl) {
    items.push({
      key: "terms_link",
      title: "Partner Terms of Service Link",
      description: "Mandatory public HTTPS link to your broadcast terms.",
      status: "Needs attention",
      actionRequired: "Enter your company terms of service URL.",
    });
  } else {
    const check = validateExternalUrlSafe(termsUrl);
    if (!check.valid) {
      items.push({
        key: "terms_link",
        title: "Partner Terms of Service Link",
        description: "Mandatory public HTTPS link to your broadcast terms.",
        status: "Needs attention",
        detail: check.error,
        actionRequired: "Provide a valid public HTTPS link.",
      });
    } else if (channel["partnerTermsApproved"] === true) {
      items.push({
        key: "terms_link",
        title: "Partner Terms of Service Link",
        description: "Mandatory public HTTPS link to your broadcast terms.",
        status: "Done",
        detail: termsUrl,
      });
    } else {
      items.push({
        key: "terms_link",
        title: "Partner Terms of Service Link",
        description: "Mandatory public HTTPS link to your broadcast terms.",
        status: "Waiting for review",
        detail: termsUrl,
      });
    }
  }

  // 3. Contact Email
  const contactEmail = typeof channel["contactEmail"] === "string" ? channel["contactEmail"].trim() : "";
  if (!contactEmail) {
    items.push({
      key: "contact_email",
      title: "Corporate Contact Email",
      description: "Official broadcast liaison and legal notices email.",
      status: "Needs attention",
      actionRequired: "Enter your corporate email address.",
    });
  } else {
    items.push({
      key: "contact_email",
      title: "Corporate Contact Email",
      description: "Official broadcast liaison and legal notices email.",
      status: "Done",
      detail: contactEmail,
    });
  }

  // 4. Licence Details & Dates
  const licenceStart = typeof channel["licenceStartDate"] === "string" ? channel["licenceStartDate"] : "";
  const licenceEnd = typeof channel["licenceEndDate"] === "string" ? channel["licenceEndDate"] : "";
  const hasLicenceProof = Boolean(channel["licenseDocumentUrl"] || channel["rightsVerified"]);

  if (!licenceStart || !licenceEnd || !hasLicenceProof) {
    items.push({
      key: "licence_dates",
      title: "Licence Details & Effective Dates",
      description: "Broadcasting license window and territorial coverage.",
      status: "Needs attention",
      actionRequired: "Upload license verification document and specify active dates.",
    });
  } else if (new Date(licenceEnd).getTime() <= Date.now()) {
    items.push({
      key: "licence_dates",
      title: "Licence Details & Effective Dates",
      description: "Broadcasting license window and territorial coverage.",
      status: "Needs attention",
      detail: "Licence has expired.",
      actionRequired: "Submit renewed license terms.",
    });
  } else if (channel["licenceApproved"] === true) {
    items.push({
      key: "licence_dates",
      title: "Licence Details & Effective Dates",
      description: "Broadcasting license window and territorial coverage.",
      status: "Done",
      detail: `Valid until ${new Date(licenceEnd).toLocaleDateString()}`,
    });
  } else {
    items.push({
      key: "licence_dates",
      title: "Licence Details & Effective Dates",
      description: "Broadcasting license window and territorial coverage.",
      status: "Waiting for review",
      detail: `Submitted: Valid until ${new Date(licenceEnd).toLocaleDateString()}`,
    });
  }

  // 5. Stream Configuration
  const streamUrl = typeof channel["streamUrl"] === "string" ? channel["streamUrl"] : "";
  if (!streamUrl) {
    items.push({
      key: "stream_config",
      title: "Stream Configuration & Encoding",
      description: "Live broadcast HLS endpoint and audio/video codecs.",
      status: "Needs attention",
      actionRequired: "Configure your live stream ingest URL.",
    });
  } else if (channel["streamApproved"] === true) {
    items.push({
      key: "stream_config",
      title: "Stream Configuration & Encoding",
      description: "Live broadcast HLS endpoint and audio/video codecs.",
      status: "Done",
      detail: "HLS Feed active and verified.",
    });
  } else {
    items.push({
      key: "stream_config",
      title: "Stream Configuration & Encoding",
      description: "Live broadcast HLS endpoint and audio/video codecs.",
      status: "Waiting for review",
      detail: "Stream endpoint submitted, awaiting operator verification.",
    });
  }

  // 6. Artwork
  const logoUrl = typeof channel["logoUrl"] === "string" ? channel["logoUrl"] : "";
  const bannerUrl = typeof channel["bannerUrl"] === "string" ? channel["bannerUrl"] : "";
  if (!logoUrl || !bannerUrl) {
    items.push({
      key: "artwork",
      title: "Channel Branding Artwork",
      description: "Square logo and 16:9 1080p broadcast banner.",
      status: "Needs attention",
      actionRequired: "Upload square channel logo and banner image.",
    });
  } else {
    items.push({
      key: "artwork",
      title: "Channel Branding Artwork",
      description: "Square logo and 16:9 1080p broadcast banner.",
      status: "Done",
      detail: "Branding assets complete.",
    });
  }

  // 7. Automatic Tests
  if (!autoTests.passed) {
    items.push({
      key: "auto_tests",
      title: "Automatic Preflight Tests",
      description: "Automated stream reachability, codecs, audio, and metadata checks.",
      status: "Needs attention",
      detail: `${autoTests.blockersCount} test failure(s) found.`,
      actionRequired: "Resolve failing test items in preflight report.",
    });
  } else {
    items.push({
      key: "auto_tests",
      title: "Automatic Preflight Tests",
      description: "Automated stream reachability, codecs, audio, and metadata checks.",
      status: "Done",
      detail: "All automated technical tests passed.",
    });
  }

  const hasNeedsAttention = items.some((i) => i.status === "Needs attention");
  const hasWaiting = items.some((i) => i.status === "Waiting for review");

  const canGoLive = !hasNeedsAttention && !hasWaiting && autoTests.passed;

  const overallStatus = canGoLive
    ? "Ready to Go Live"
    : hasNeedsAttention
      ? "Action Required"
      : "Review in Progress";

  return {
    channelId,
    channelName,
    contentOwnerCompany,
    platformCreator,
    canGoLive,
    overallStatus,
    items,
    autoTestReport: autoTests,
  };
}
