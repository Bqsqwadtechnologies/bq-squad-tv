import { Firestore } from "@/lib/server/firebase-admin";

export type BadgeCounts = {
  unreadMessages: number;
  pendingReviews: number;
  changeRequests: number;
  supportTickets: number;
  total: number;
  displayTotal: string;
};

export async function getBadgeCounts(fs: Firestore, uid: string): Promise<BadgeCounts> {
  const doc = await fs.getDoc(`badgeCounts/${uid}`);
  const unreadMessages = Math.max(0, Number(doc?.["unreadMessages"] || 0));
  const pendingReviews = Math.max(0, Number(doc?.["pendingReviews"] || 0));
  const changeRequests = Math.max(0, Number(doc?.["changeRequests"] || 0));
  const supportTickets = Math.max(0, Number(doc?.["supportTickets"] || 0));

  const total = unreadMessages + pendingReviews + changeRequests + supportTickets;
  const displayTotal = total > 99 ? "99+" : String(total);

  return {
    unreadMessages,
    pendingReviews,
    changeRequests,
    supportTickets,
    total,
    displayTotal,
  };
}

export async function incrementBadgeCount(
  fs: Firestore,
  uid: string,
  key: "unreadMessages" | "pendingReviews" | "changeRequests" | "supportTickets",
  delta = 1,
): Promise<BadgeCounts> {
  const current = await getBadgeCounts(fs, uid);
  const updatedValue = Math.max(0, current[key] + delta);
  const now = new Date().toISOString();

  await fs.patchDoc(`badgeCounts/${uid}`, {
    [key]: updatedValue,
    updatedAt: now,
  });

  return getBadgeCounts(fs, uid);
}

export async function clearBadgeCount(
  fs: Firestore,
  uid: string,
  key: "unreadMessages" | "pendingReviews" | "changeRequests" | "supportTickets" | "all",
): Promise<BadgeCounts> {
  const now = new Date().toISOString();
  if (key === "all") {
    await fs.setDoc(`badgeCounts/${uid}`, {
      unreadMessages: 0,
      pendingReviews: 0,
      changeRequests: 0,
      supportTickets: 0,
      updatedAt: now,
    });
  } else {
    await fs.patchDoc(`badgeCounts/${uid}`, {
      [key]: 0,
      updatedAt: now,
    });
  }

  return getBadgeCounts(fs, uid);
}
