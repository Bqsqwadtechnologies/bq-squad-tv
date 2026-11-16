"""Modal deployment for the existing BQ SQWAD TV FFmpeg queue worker.

This is a compute adapter only. Firestore remains the queue authority and the
existing authenticated worker API remains responsible for claims, leases,
storage targets, HLS validation, and publication.
"""
from __future__ import annotations

from pathlib import Path

import modal

HERE = Path(__file__).resolve().parent
APP_NAME = "bq-sqwad-tv-video-worker"
SECRET_NAME = "bq-sqwad-tv-worker"

# Modal requires add_local_* operations to be the final image-building steps.
# Keep workdir before them so the image builder can package local source files.
image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .workdir("/app")
    .add_local_file(str(HERE / "runner.py"), remote_path="/app/runner.py")
    .add_local_file(str(HERE / "transcode.py"), remote_path="/app/transcode.py")
)

app = modal.App(APP_NAME)
worker_secret = modal.Secret.from_name(SECRET_NAME)


@app.function(
    image=image,
    secrets=[worker_secret],
    schedule=modal.Period(seconds=30),
    cpu=0.25,
    memory=512,
    timeout=90,
    max_containers=1,
)
def poll_firestore_queue() -> None:
    """Claim at most one job; the API atomically leases each claimed job."""
    import runner

    response = runner.signed_request(
        "POST", "/api/public/v1/worker/jobs/claim", {}
    )
    job = response.get("job")
    if job:
        transcode_claimed_job.spawn(job)


@app.function(
    image=image,
    secrets=[worker_secret],
    cpu=2,
    memory=4096,
    timeout=10_800,
    max_containers=2,
)
def transcode_claimed_job(job: dict) -> None:
    """Run one existing worker job with bounded initial test capacity."""
    import runner

    asset_id = str(job.get("assetId", "unknown"))
    try:
        runner.process_job(job)
    except Exception:
        try:
            runner.signed_request(
                "POST",
                f"/api/public/v1/worker/jobs/{asset_id}/fail",
                {
                    "claimToken": job["claimToken"],
                    "errorCode": "WORKER_PROCESSING_FAILED",
                },
            )
        except Exception:
            # The API lease/recovery mechanism remains the final safety net.
            pass
        raise
