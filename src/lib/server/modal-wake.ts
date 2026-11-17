export async function wakeModalVideoWorker(): Promise<void> {
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
    if (!response.ok) console.warn("Video worker wake request was not accepted.", { status: response.status });
  } catch {
    console.warn("Video worker wake request failed; the scheduled fallback remains active.");
  }
}
