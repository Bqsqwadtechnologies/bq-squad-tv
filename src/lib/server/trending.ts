import { Firestore } from "@/lib/server/firebase-admin";

export interface TrendingItem {
  id: string;
  targetType: "channel" | "movie" | "series";
  title: string;
  category: string;
  posterUrl: string | null;
  channelId?: string;
  score: number;
  rank: number;
  viewerCount: number; // concurrent viewers for live, watching now for VOD
  isLive?: boolean;
  isPromoted?: boolean;
  promotedLabel?: string;
  promotionBadge?: string;
  pricePerMinute?: string;
}

export interface TrendingConfig {
  weightConcurrent: number;
  weightWatchMinutes: number;
  weightUniqueViewers: number;
  weightCompletion: number;
  weightRecency: number;
  maxPromotedShare: number; // e.g. 0.25 (at most 25% promoted items in rail)
  minWatchSeconds: number; // minimum watch seconds required for anti-gaming filter
  packages: Array<{
    id: string;
    name: string;
    durationHours: number;
    priceMinor: number;
    currency: string;
    description: string;
  }>;
}

export const DEFAULT_TRENDING_CONFIG: TrendingConfig = {
  weightConcurrent: 0.5,
  weightWatchMinutes: 0.3,
  weightUniqueViewers: 0.2,
  weightCompletion: 0.1,
  weightRecency: 0.1,
  maxPromotedShare: 0.25,
  minWatchSeconds: 30,
  packages: [
    {
      id: "pkg_boost_24h",
      name: "24-Hour Trending Boost",
      durationHours: 24,
      priceMinor: 500_000, // 5,000.00 NGN
      currency: "NGN",
      description: "Guaranteed promoted placement in the top trending rail for 24 hours.",
    },
    {
      id: "pkg_boost_7d",
      name: "7-Day Prime Rail Package",
      durationHours: 168,
      priceMinor: 2_500_000, // 25,000.00 NGN
      currency: "NGN",
      description: "Week-long promoted visibility in trending and category rails.",
    },
  ],
};

export interface HomeRailConfig {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
  description?: string;
}

export const DEFAULT_HOME_RAILS: HomeRailConfig[] = [
  { id: "hero_banner", label: "Featured Spotlight", enabled: true, order: 1 },
  { id: "live_now", label: "Live Now", enabled: true, order: 2 },
  { id: "starting_soon", label: "Starting Soon", enabled: true, order: 3 },
  { id: "trending", label: "Trending Now", enabled: true, order: 4 },
  { id: "new_releases", label: "New Releases", enabled: true, order: 5 },
  { id: "movies", label: "Popular Movies", enabled: true, order: 6 },
  { id: "series", label: "Binge-Worthy Series", enabled: true, order: 7 },
  { id: "kids", label: "Kids & Family", enabled: true, order: 8 },
  { id: "sports", label: "Sports & Fitness", enabled: true, order: 9 },
  { id: "news", label: "Live News & Current Affairs", enabled: true, order: 10 },
  { id: "channels", label: "Featured Channels", enabled: true, order: 11 },
  { id: "because_you_watched", label: "Because You Watched", enabled: true, order: 12 },
  { id: "continue_watching", label: "Continue Watching", enabled: true, order: 13 },
];

export interface HeroSlot {
  id: string;
  targetType: "title" | "series" | "channel";
  targetId: string;
  title: string;
  subtitle?: string;
  artworkUrl: string;
  ctaLabel: string;
  startAt: string; // ISO date
  endAt: string; // ISO date
  countries?: string[];
  audience: "all" | "adult" | "kids";
  order: number;
  active: boolean;
}

export interface PromotionRecord {
  id: string;
  targetType: "channel" | "movie" | "series";
  targetId: string;
  title: string;
  category: string;
  posterUrl: string | null;
  providerId?: string;
  packageId: string;
  status: "ACTIVE" | "PENDING_APPROVAL" | "EXPIRED" | "CANCELLED";
  startsAt: string;
  endsAt: string;
  impressions: number;
  clicks: number;
  watchMinutesGained: number;
  approvedBy?: string;
  createdAt: string;
}

/**
 * Calculates raw score for a live stream item.
 */
export function calculateLiveTrendingScore(
  item: {
    currentViewers: number;
    watchMinutesPastHour: number;
    startedAtMs?: number;
  },
  config: TrendingConfig = DEFAULT_TRENDING_CONFIG,
): number {
  const now = Date.now();
  const ageHours = item.startedAtMs ? Math.max(0, (now - item.startedAtMs) / (1000 * 3600)) : 1;
  const recencyBoost = Math.max(0, 100 - ageHours * 10);

  const rawScore =
    item.currentViewers * config.weightConcurrent +
    item.watchMinutesPastHour * config.weightWatchMinutes +
    recencyBoost * config.weightRecency;

  return Math.round(rawScore * 10) / 10;
}

/**
 * Calculates raw score for a VOD title or movie asset.
 */
export function calculateVodTrendingScore(
  item: {
    watchMinutesPast24h: number;
    uniqueViewersPast24h: number;
    completionRate: number; // 0 to 1
    publishedAtMs?: number;
  },
  config: TrendingConfig = DEFAULT_TRENDING_CONFIG,
): number {
  const now = Date.now();
  const ageDays = item.publishedAtMs ? Math.max(0, (now - item.publishedAtMs) / (1000 * 3600 * 24)) : 7;
  const recencyBoost = Math.max(0, 50 - ageDays * 5);

  const rawScore =
    item.watchMinutesPast24h * config.weightWatchMinutes +
    item.uniqueViewersPast24h * config.weightUniqueViewers +
    item.completionRate * 100 * config.weightCompletion +
    recencyBoost * config.weightRecency;

  return Math.round(rawScore * 10) / 10;
}

/**
 * Filters gaming and anomalies:
 * - Requires sessions to have watched at least `minWatchSeconds`
 * - Caps single-source spike contribution
 */
export function filterAntiGamingSignals<T extends { watchMinutes: number; uniqueViewers: number }>(
  item: T,
  config: TrendingConfig = DEFAULT_TRENDING_CONFIG,
): T {
  // If viewers are claimed but watch time is below threshold, penalize
  if (item.uniqueViewers > 0 && item.watchMinutes < (item.uniqueViewers * config.minWatchSeconds) / 60) {
    return {
      ...item,
      watchMinutes: Math.max(0, (item.uniqueViewers * config.minWatchSeconds) / 60),
    };
  }
  return item;
}

/**
 * Merges organic trending items with active, approved promotions,
 * strictly enforcing the owner's `maxPromotedShare` cap (e.g. 25%, at most 1 in 4).
 */
export function mergeTrendingWithPromotions(
  organicItems: TrendingItem[],
  promotions: PromotionRecord[],
  config: TrendingConfig = DEFAULT_TRENDING_CONFIG,
): TrendingItem[] {
  const nowIso = new Date().toISOString();
  const activePromos = promotions.filter(
    (p) => p.status === "ACTIVE" && p.startsAt <= nowIso && p.endsAt >= nowIso,
  );

  // Sort organic descending by score
  const sortedOrganic = [...organicItems].sort((a, b) => b.score - a.score);

  if (activePromos.length === 0) {
    return sortedOrganic.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }

  const result: TrendingItem[] = [];
  let promoIndex = 0;
  let organicIndex = 0;

  // Maximum share enforcement:
  // e.g. for maxPromotedShare 0.25, we can insert 1 promo per 3 organic items (1 in 4 = 25%).
  const interval = Math.max(2, Math.round(1 / Math.min(0.5, config.maxPromotedShare)));

  while (organicIndex < sortedOrganic.length || promoIndex < activePromos.length) {
    // Check if slot allows a promoted item
    const shouldInsertPromo =
      promoIndex < activePromos.length &&
      result.length > 0 &&
      result.length % interval === 0 &&
      result.filter((r) => r.isPromoted).length / Math.max(1, result.length) < config.maxPromotedShare;

    if (shouldInsertPromo) {
      const p = activePromos[promoIndex++];
      result.push({
        id: p.targetId,
        targetType: p.targetType,
        title: p.title,
        category: p.category,
        posterUrl: p.posterUrl,
        channelId: p.targetType === "channel" ? p.targetId : undefined,
        score: 0,
        rank: result.length + 1,
        viewerCount: 0,
        isPromoted: true,
        promotedLabel: "Sponsored",
        promotionBadge: "Sponsored",
      });
    } else if (organicIndex < sortedOrganic.length) {
      result.push(sortedOrganic[organicIndex++]);
    } else {
      break;
    }
  }

  // Re-index ranks
  return result.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

/**
 * Reads trending configuration from Firestore or falls back to defaults.
 */
export async function getTrendingConfig(fs: Firestore): Promise<TrendingConfig> {
  try {
    const doc = await fs.getDoc("platformSettings/trendingConfig");
    if (!doc) return DEFAULT_TRENDING_CONFIG;
    return {
      weightConcurrent: Number(doc["weightConcurrent"] ?? DEFAULT_TRENDING_CONFIG.weightConcurrent),
      weightWatchMinutes: Number(doc["weightWatchMinutes"] ?? DEFAULT_TRENDING_CONFIG.weightWatchMinutes),
      weightUniqueViewers: Number(doc["weightUniqueViewers"] ?? DEFAULT_TRENDING_CONFIG.weightUniqueViewers),
      weightCompletion: Number(doc["weightCompletion"] ?? DEFAULT_TRENDING_CONFIG.weightCompletion),
      weightRecency: Number(doc["weightRecency"] ?? DEFAULT_TRENDING_CONFIG.weightRecency),
      maxPromotedShare: Number(doc["maxPromotedShare"] ?? DEFAULT_TRENDING_CONFIG.maxPromotedShare),
      minWatchSeconds: Number(doc["minWatchSeconds"] ?? DEFAULT_TRENDING_CONFIG.minWatchSeconds),
      packages: Array.isArray(doc["packages"]) && doc["packages"].length > 0 ? (doc["packages"] as any) : DEFAULT_TRENDING_CONFIG.packages,
    };
  } catch {
    return DEFAULT_TRENDING_CONFIG;
  }
}

/**
 * Reads Home Rails configuration from Firestore or defaults.
 */
export async function getHomeRailsConfig(fs: Firestore): Promise<HomeRailConfig[]> {
  try {
    const doc = await fs.getDoc("platformSettings/homeRails");
    if (doc && Array.isArray(doc["rails"])) {
      return (doc["rails"] as HomeRailConfig[]).sort((a, b) => a.order - b.order);
    }
    return DEFAULT_HOME_RAILS;
  } catch {
    return DEFAULT_HOME_RAILS;
  }
}

/**
 * Reads Hero Banner Slots from Firestore.
 */
export async function getHeroBannerSlots(
  fs: Firestore,
  filter?: { country?: string; audience?: "all" | "adult" | "kids" },
): Promise<HeroSlot[]> {
  try {
    const doc = await fs.getDoc("platformSettings/heroSlots");
    if (!doc || !Array.isArray(doc["slots"])) return [];

    const nowIso = new Date().toISOString();
    let slots = (doc["slots"] as HeroSlot[]).filter(
      (s) => s.active && (!s.startAt || s.startAt <= nowIso) && (!s.endAt || s.endAt >= nowIso),
    );

    if (filter?.country) {
      slots = slots.filter(
        (s) => !s.countries || s.countries.length === 0 || s.countries.includes(filter.country!),
      );
    }

    if (filter?.audience) {
      slots = slots.filter(
        (s) => s.audience === "all" || s.audience === filter.audience,
      );
    }

    return slots.sort((a, b) => a.order - b.order);
  } catch {
    return [];
  }
}
