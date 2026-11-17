export type StoredDeviceRecord = Record<string, unknown> & { __id: string };

export function toPublicDeviceRecord(device: StoredDeviceRecord) {
  return {
    id: device.__id,
    platform: device["platform"] === "web" ? "web" : "android",
    deviceName: typeof device["deviceName"] === "string" ? device["deviceName"] : null,
    status: device["status"] === "REVOKED" ? "REVOKED" : "ACTIVE",
    updatedAt: typeof device["updatedAt"] === "string" ? device["updatedAt"] : null,
  } as const;
}
