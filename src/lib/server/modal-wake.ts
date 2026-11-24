import type { Firestore } from "./firebase-admin";
import { videoWorkerRetryIsDue } from "./video-worker-policy";

export async function wakeModalVideoWorker(fs: Firestore): Promise<void> {
  // Never start the Modal endpoint unless a queued transcode is actually eligible.
  const queuedJobs = await fs.query("videoTranscodeJobs", {
    filters: [{ field: "status", op: "EQUAL", value: "queued" }],
    orderByField: "createdAt",
    limit: 10,
  }).catch(() => []);
  if (!queuedJobs.some((job) => videoWorkerRetryIsDue(job["nextAttemptAt"]))) return;
  const endpoint = (process.env["MODAL_WAKE_URL"] ?? "").trim();
  const secret = process.env["MODAL_WAKE_SECRET"] ?? "";
  if (!endpoint || secret.length < 32) return;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    console.error("Video worker wake URL is invalid.");
    return;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    console.error("Video worker wake URL must be a secure HTTPS address.");
    return;
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { authorization: "Bearer " + secret, "content-type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok)
      console.warn("Video worker wake request was not accepted.", { status: response.status });
  } catch {
    console.warn("Video worker wake request failed; the scheduled fallback remains active.");
  }
}
