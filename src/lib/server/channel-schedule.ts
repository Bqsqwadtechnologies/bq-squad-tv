import { z } from "zod";
import { ApiError, type Firestore, encodeFields, type FirestoreWrite } from "./firebase-admin";

export const channelScheduleSchema = z.object({
  programmeId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(3000).default(""),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  contentAssetId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  reason: z.string().trim().min(3).max(500).default("Channel schedule updated"),
});

type ScheduleIndexItem = { id: string; startsAt: string; endsAt: string };

const MAX_SCHEDULE_ITEMS = 300;
const schedulePath = (channelId: string) => "channels/" + channelId + "/schedule";
const indexPath = (channelId: string) => "scheduleReservations/" + channelId;

function readIndexItems(value: unknown): ScheduleIndexItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ScheduleIndexItem[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row["id"] !== "string" || typeof row["startsAt"] !== "string" ||
        typeof row["endsAt"] !== "string" ||
        !Number.isFinite(Date.parse(row["startsAt"])) ||
        !Number.isFinite(Date.parse(row["endsAt"]))) return [];
    return [{ id: row["id"], startsAt: row["startsAt"], endsAt: row["endsAt"] }];
  });
}

async function ensureScheduleIndex(fs: Firestore, channelId: string): Promise<void> {
  const path = indexPath(channelId);
  if (await fs.getDoc(path)) return;
  const existing = await fs.query(schedulePath(channelId), { limit: MAX_SCHEDULE_ITEMS + 1 });
  if (existing.length > MAX_SCHEDULE_ITEMS) {
    throw new ApiError(503, "SCHEDULE_INDEX_REQUIRES_MIGRATION", "This channel has too many schedule entries for automatic index initialization.");
  }
  const items = existing.flatMap((item): ScheduleIndexItem[] => {
    const startsAt = item["startsAt"];
    const endsAt = item["endsAt"];
    if (typeof startsAt !== "string" || typeof endsAt !== "string" ||
        !Number.isFinite(Date.parse(startsAt)) || !Number.isFinite(Date.parse(endsAt))) return [];
    return [{ id: item.__id, startsAt, endsAt }];
  });
  try {
    await fs.setDoc(path, { items, updatedAt: new Date().toISOString() }, { mustNotExist: true });
  } catch (error) {
    if (!(await fs.getDoc(path))) throw error;
  }
}

export async function saveChannelSchedule(
  fs: Firestore,
  channelId: string,
  actorUid: string,
  input: z.input<typeof channelScheduleSchema>,
): Promise<{ programmeId: string; created: boolean }> {
  const start = Date.parse(input.startsAt);
  const end = Date.parse(input.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 60 * 60_000) {
    throw new ApiError(400, "SCHEDULE_TIME_INVALID", "The programme must have a valid end time within 24 hours of its start.");
  }
  if (input.contentAssetId) {
    const asset = await fs.getDoc("contentAssets/" + input.contentAssetId);
    const license = asset?.["license"] as Record<string, unknown> | undefined;
    if (!asset || asset["channelId"] !== channelId || asset["status"] !== "ready" ||
        license?.["status"] !== "verified" || license["verificationStatus"] !== "verified") {
      throw new ApiError(409, "SCHEDULE_ASSET_NOT_READY", "A scheduled content asset must be ready and have verified distribution rights.");
    }
  }

  await ensureScheduleIndex(fs, channelId);
  const programmeId = input.programmeId ?? crypto.randomUUID().replace(/-/g, "");
  const path = schedulePath(channelId) + "/" + programmeId;
  const reservation = indexPath(channelId);
  const outcome = await fs.transact([reservation, path], ([index, current]) => {
    const created = !input.programmeId;
    if (created && current) throw new ApiError(409, "SCHEDULE_ID_CONFLICT", "This schedule identifier is already in use.");
    if (!created && (!current || current["channelId"] !== channelId)) {
      throw new ApiError(404, "SCHEDULE_ITEM_NOT_FOUND", "This schedule item does not exist.");
    }
    const items = readIndexItems(index?.["items"]);
    const overlaps = items.some(item =>
      item.id !== programmeId &&
      start < Date.parse(item.endsAt) &&
      end > Date.parse(item.startsAt),
    );
    if (overlaps) throw new ApiError(409, "SCHEDULE_OVERLAP", "This programme overlaps another scheduled programme on the channel.");
    const nextItems = [
      ...items.filter(item => item.id !== programmeId),
      { id: programmeId, startsAt: input.startsAt, endsAt: input.endsAt },
    ].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
    if (nextItems.length > MAX_SCHEDULE_ITEMS) {
      throw new ApiError(409, "SCHEDULE_LIMIT_REACHED", "This channel has reached its schedule item limit.");
    }
    const now = new Date().toISOString();
    const programmeFields = {
      channelId,
      title: input.title,
      description: input.description ?? "",
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      contentAssetId: input.contentAssetId ?? null,
      status: "SCHEDULED",
      ...(created ? { createdBy: actorUid, createdAt: now } : {}),
      updatedBy: actorUid,
      updatedAt: now,
    };
    const writes: FirestoreWrite[] = [
      {
        update: { name: fs.docName(path), fields: encodeFields(programmeFields) },
        ...(created ? { currentDocument: { exists: false } } : {}),
      },
      {
        update: {
          name: fs.docName(reservation),
          fields: encodeFields({ items: nextItems, updatedAt: now }),
        },
        updateMask: { fieldPaths: ["items", "updatedAt"] },
      },
    ];
    return { result: { programmeId, created }, writes };
  });
  return outcome;
}

export async function deleteChannelSchedule(
  fs: Firestore,
  channelId: string,
  programmeId: string,
): Promise<void> {
  await ensureScheduleIndex(fs, channelId);
  const path = schedulePath(channelId) + "/" + programmeId;
  const reservation = indexPath(channelId);
  await fs.transact([reservation, path], ([index, current]) => {
    if (!current || current["channelId"] !== channelId) {
      throw new ApiError(404, "SCHEDULE_ITEM_NOT_FOUND", "This schedule item does not exist.");
    }
    const items = readIndexItems(index?.["items"]).filter(item => item.id !== programmeId);
    const writes: FirestoreWrite[] = [
      { delete: fs.docName(path) },
      {
        update: {
          name: fs.docName(reservation),
          fields: encodeFields({ items, updatedAt: new Date().toISOString() }),
        },
        updateMask: { fieldPaths: ["items", "updatedAt"] },
      },
    ];
    return { result: undefined, writes };
  });
}
