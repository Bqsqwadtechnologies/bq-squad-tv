import type { Firestore } from "./firebase-admin";

export const DEFAULT_FLAGS = {
  producerChannelCreation: false,
  waitingRoom: true,
  maintenanceMode: false,
  signupsOpen: true,
  commentsOpen: true,
  newStreamGrants: true,
  adultChannels: false,
  liveTv: false,
  providerConsole: false,
  hlsEncryption: false,
  forYou: false,
  reminders: false,
} as const;

export type PlatformFlags = { -readonly [K in keyof typeof DEFAULT_FLAGS]: boolean };

export function normalizePlatformFlags(value: Record<string, unknown> | null | undefined): PlatformFlags {
  const flags: PlatformFlags = { ...DEFAULT_FLAGS };
  if (!value) return flags;
  for (const key of Object.keys(DEFAULT_FLAGS) as Array<keyof typeof DEFAULT_FLAGS>) {
    if (typeof value[key] === "boolean") flags[key] = value[key] as boolean;
  }
  return flags;
}

export async function getPlatformFlags(fs: Firestore): Promise<PlatformFlags> {
  return normalizePlatformFlags(await fs.getDoc("config/flags"));
}

export function publicFlags(flags: PlatformFlags) {
  return {
    waitingRoom: flags.waitingRoom,
    maintenanceMode: flags.maintenanceMode,
    signupsOpen: flags.signupsOpen,
    commentsOpen: flags.commentsOpen,
    newStreamGrants: flags.newStreamGrants,
    adultChannels: flags.adultChannels,
    liveTv: flags.liveTv,
    forYou: flags.forYou,
    reminders: flags.reminders,
  };
}
