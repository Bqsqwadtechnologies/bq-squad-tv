import { type Firestore, getAdminAccessToken, getFirebaseProjectId } from "./firebase-admin";

export type PushNotification = {
  notificationId: string;
  title: string;
  body: string;
  deepLink?: string;
};

export async function sendPushNotificationToUser(
  fs: Firestore,
  uid: string,
  notification: PushNotification,
): Promise<{ sentCount: number; failedCount: number; deviceCount: number }> {
  const devices = await fs.query("users/" + uid + "/devices", {
    filters: [{ field: "status", op: "EQUAL", value: "ACTIVE" }],
    limit: 5,
  });
  const tokens = devices
    .map(device => ({ id: device.__id, token: device["token"] }))
    .filter((device): device is { id: string; token: string } =>
      typeof device.token === "string" && device.token.length >= 40,
    );
  if (tokens.length === 0) return { sentCount: 0, failedCount: 0, deviceCount: 0 };

  const accessToken = await getAdminAccessToken("https://www.googleapis.com/auth/firebase.messaging");
  const projectId = getFirebaseProjectId();
  let sentCount = 0;
  let failedCount = 0;

  for (const device of tokens) {
    let response: Response;
    try {
      response = await fetch(
        "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) + "/messages:send",
        {
          method: "POST",
          headers: {
            authorization: "Bearer " + accessToken,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title: notification.title, body: notification.body },
              android: {
                notification: {
                  icon: "ic_stat_bq_sqwad_tv",
                  image: "https://tv.bqsqwad.com/brand/bq-sqwad-tv-logo.png",
                },
              },
              data: {
                notificationId: notification.notificationId,
                deepLink: notification.deepLink ?? "",
              },
            },
          }),
        },
      );
    } catch {
      failedCount += 1;
      continue;
    }

    if (response.ok) {
      sentCount += 1;
      continue;
    }

    failedCount += 1;
    const failure = await response.json().catch(() => null) as {
      error?: { details?: Array<{ errorCode?: string }> };
    } | null;
    const errorCodes = failure?.error?.details?.map(detail => detail.errorCode) ?? [];
    if (errorCodes.includes("UNREGISTERED")) {
      await fs.patchDoc("users/" + uid + "/devices/" + device.id, {
        status: "INVALID",
        token: null,
        invalidatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }
  }

  return { sentCount, failedCount, deviceCount: tokens.length };
}

export function notificationDeliveryStatus(
  result: { sentCount: number; failedCount: number; deviceCount: number },
): "sent" | "partial" | "failed" | "no_devices" {
  if (result.deviceCount === 0) return "no_devices";
  if (result.sentCount > 0 && result.failedCount === 0) return "sent";
  if (result.sentCount > 0) return "partial";
  return "failed";
}
