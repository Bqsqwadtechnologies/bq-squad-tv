# BQ SQWAD TV FFmpeg VOD worker — first implementation slice

This is a provider-neutral local-file transcoding worker. It converts an authorized
source movie into an adaptive HLS VOD ladder. It does not upload files, write to
Firestore, publish content, issue playback URLs, or deduct viewer wallet balances.

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

Run with no network access. Mount the source read-only and an empty output directory:
docker run --rm --network none -v "$PWD/authorized-movie.mp4:/work/source.mp4:ro" -v "$PWD/hls-output:/work/output" bq-sqwad-ffmpeg-worker --input /work/source.mp4 --output /work/output --threads 2

## Application queue integration status

After the private source upload is verified, the application now records an idempotent
Firestore job in `videoTranscodeJobs/{assetId}` and marks the content asset as
`uploaded_pending_transcode`. The job records the source bucket/path and the existing
private HLS destination bucket/prefix. Video Studio reports that the job is queued.

**This is a durable queue record, not a running worker.** No always-on processor has
been deployed or connected to consume the queue yet. Jobs remain queued until a separately
configured worker runner claims them, downloads the authorized source through a
server-side storage adapter, runs this CLI, uploads and verifies every HLS object, and
updates the Firestore job and asset states. Do not mark an asset ready merely because
the queue record exists.

## Security and production integration boundaries

- Process only content BQ owns or is contractually authorized to host.
- The worker accepts local paths only; it does not fetch arbitrary URLs.
- Run as an unprivileged user, with network disabled unless a separately reviewed
  upload adapter is added.
- Give each job an isolated temporary directory and enforce host-level CPU, memory,
  disk, duration and concurrency limits.
- Do not expose the worker filesystem or FFmpeg process to viewer clients.
- A separate authenticated orchestrator must verify the source object, enqueue a job,
  invoke this worker, upload the generated HLS tree to private object storage, verify
  the master and child playlists/segments, then transition the Firestore asset from
  uploaded_pending_transcode to ready only after all checks pass.
- The current app upload routes and HLS proxy use the existing private storage
  integration. This worker intentionally leaves the existing Lovable-managed
  private buckets and storage provider unchanged. Any additional storage provider
  must be added as a separate, server-only adapter without migrating existing objects.
- Live ingest (MediaMTX/SRS), live recording, downloads, DRM and production deployment
  are not included in this first code slice.
