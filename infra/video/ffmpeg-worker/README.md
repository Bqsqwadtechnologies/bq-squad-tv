# BQ SQWAD TV FFmpeg VOD worker — first implementation slice

This worker polls the authenticated BQ SQWAD TV processing API, downloads an authorized source through a short-lived private URL, converts it locally, uploads HLS files to one reserved private destination, and asks the API to verify the complete output before publishing. It never handles viewer wallets or billing.

## Why it is separate

The TanStack/Lovable application runtime is not a persistent media-processing server.
FFmpeg needs a separate Linux host or container worker with CPU, temporary disk and
a controlled job runner. Do not run long FFmpeg jobs inside a normal viewer API request.

## Output

The worker creates a master.m3u8 playlist and one rendition directory per available
resolution (v360, v480, v720 and/or v1080), containing a child playlist and four-second
MPEG-TS HLS segments. It never upscales a source. A lower-resolution source produces
only renditions up to its original height. Source metadata is stripped from outputs.

## Run locally

Requirements: Python 3.12+, FFmpeg and FFprobe.

Run the tests with:
python -m unittest discover -s infra/video/ffmpeg-worker -v

Transcode an authorized source:
python infra/video/ffmpeg-worker/transcode.py --input ./authorized-movie.mp4 --output ./work/asset-123

## Run in Docker

Build:
docker build -t bq-sqwad-ffmpeg-worker infra/video/ffmpeg-worker

Run the persistent queue runner with outbound HTTPS access to the BQ SQWAD TV API and the configured private storage provider. Supply secrets through the container host secret manager, never in the image or command line.

## Application queue integration

The worker now consumes `videoTranscodeJobs` through authenticated API endpoints:

1. Claim a queued job with a short-lived lease.
2. Download the verified source using a short-lived private URL.
3. Reserve one HLS destination for the entire ladder.
4. Transcode locally using the same tested FFmpeg pipeline.
5. Request a scoped upload URL for each HLS object and upload it.
6. Submit the object manifest; the API checks object sizes, playlists and referenced segments.
7. The API marks the asset ready only after every check passes.

The worker signs each API request with a domain-separated key derived from the existing `STREAMING_HMAC_SECRET`. Requests include a timestamp and one-use nonce. The API rejects stale, invalid and replayed requests. The worker renews its lease while FFmpeg is running, and failed jobs retry up to five attempts.

### Runtime configuration

- `BQ_TV_API_BASE_URL`: HTTPS origin of the deployed BQ SQWAD TV API.
- `STREAMING_HMAC_SECRET`: existing server secret, injected into the worker using the host's secret manager.
- Optional `WORKER_POLL_SECONDS` and `FFMPEG_THREADS`.

Build the image using the manual GitHub Actions workflow. Publishing the image does not deploy or start a persistent worker. An owner must configure an approved always-on container host, inject the secrets securely, provide persistent logs and temporary disk, and set CPU, memory, disk, duration and concurrency limits. Until that host is running, jobs remain queued.

## Security and production integration boundaries

- Process only content BQ owns or is contractually authorized to host.
- The worker accepts local paths only; it does not fetch arbitrary URLs.
- Run as an unprivileged user. Allow only outbound HTTPS required for the application API and configured private storage endpoints; do not expose inbound worker ports.
- Give each job an isolated temporary directory and enforce host-level CPU, memory,
  disk, duration and concurrency limits.
- Do not expose the worker filesystem or FFmpeg process to viewer clients.
- The API is the authority for source verification, job leases, output reservation, object verification and the final uploaded_pending_transcode to ready transition.
- Existing Lovable-managed buckets remain registered and readable. New HLS output uses one selected destination per asset; legacy assets retain their existing playback fallback.
- Live ingest (MediaMTX/SRS), live recording, downloads, DRM and production deployment
  are not included in this first code slice.
