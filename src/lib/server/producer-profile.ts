import { Firestore, ApiError } from "./firebase-admin";

export interface PublicProducer {
  uid: string;
  publicId: string | null;
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  links: Array<{ title: string; url: string }>;
  verified: boolean;
  followerCount: number;
  totalTitles: number;
  joinedAt: string | null;
}

export async function resolveProducerBySlugOrId(
  fs: Firestore,
  slugOrId: string,
): Promise<{ producerDoc: Record<string, unknown>; uid: string }> {
  const clean = (slugOrId || "").trim();
  if (!clean) {
    throw new ApiError(404, "PRODUCER_NOT_FOUND", "Producer profile not found.");
  }

  // 1. Direct UID lookup
  let producer = await fs.getDoc(`producers/${clean}`);
  let uid = clean;

  // 2. Lookup by slug in producerSlugs/{slug}
  if (!producer) {
    const slugDoc = await fs.getDoc(`producerSlugs/${clean.toLowerCase()}`);
    if (slugDoc && typeof slugDoc["uid"] === "string") {
      uid = slugDoc["uid"];
      producer = await fs.getDoc(`producers/${uid}`);
    }
  }

  // 3. Lookup by publicId in publicIds/{id}
  if (!producer && clean.startsWith("BQ-P-")) {
    const idDoc = await fs.getDoc(`publicIds/${clean}`);
    if (idDoc && typeof idDoc["uid"] === "string") {
      uid = idDoc["uid"];
      producer = await fs.getDoc(`producers/${uid}`);
    }
  }

  // 4. Query producers collection by slug or publicId if index exists
  if (!producer) {
    const bySlug = await fs.query("producers", {
      filters: [{ field: "slug", op: "EQUAL", value: clean.toLowerCase() }],
      limit: 1,
    });
    const match = bySlug[0];
    if (match) {
      producer = match;
      uid = match.__id || (typeof match["uid"] === "string" ? match["uid"] : clean);
    }
  }

  if (!producer) {
    throw new ApiError(404, "PRODUCER_NOT_FOUND", "This producer profile could not be found.");
  }

  return { producerDoc: producer, uid };
}

export function formatPublicProducer(
  producer: Record<string, unknown>,
  uid: string,
  totalTitles = 0,
): PublicProducer {
  const isKycApproved = producer["verificationStatus"] === "APPROVED";
  const name =
    (typeof producer["displayName"] === "string" && producer["displayName"].trim()) ||
    (typeof producer["name"] === "string" && producer["name"].trim()) ||
    "Independent Producer";

  const slug =
    (typeof producer["slug"] === "string" && producer["slug"].trim()) ||
    (typeof producer["publicId"] === "string" && producer["publicId"].trim()) ||
    uid;

  const rawLinks = Array.isArray(producer["externalLinks"]) ? producer["externalLinks"] : [];
  const links = rawLinks
    .filter(
      (l): l is { title: string; url: string } =>
        typeof l === "object" && l !== null && typeof l.url === "string",
    )
    .slice(0, 5);

  return {
    uid,
    publicId: typeof producer["publicId"] === "string" ? producer["publicId"] : null,
    slug,
    name,
    bio: typeof producer["bio"] === "string" ? producer["bio"] : "",
    avatarUrl: typeof producer["avatarUrl"] === "string" ? producer["avatarUrl"] : null,
    bannerUrl: typeof producer["bannerUrl"] === "string" ? producer["bannerUrl"] : null,
    links,
    verified: isKycApproved, // Verified tick derived purely from approved KYC without disclosing KYC documents
    followerCount: Math.max(0, Number(producer["followerCount"]) || 0),
    totalTitles,
    joinedAt: typeof producer["createdAt"] === "string" ? producer["createdAt"] : null,
  };
}
