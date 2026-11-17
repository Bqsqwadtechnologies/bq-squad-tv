"""Modal deployment for the existing BQ SQWAD TV FFmpeg queue worker.

Firestore remains the queue authority. This file only wakes and executes the
existing signed worker routes; it does not add a queue or a second worker.
"""
from __future__ import annotations

import hmac
import os
from pathlib import Path

import modal
from fastapi import HTTPException, Request

HERE = Path(__file__).resolve().parent
APP_NAME = "bq-sqwad-tv-video-worker"
SECRET_NAME = "bq-sqwad-tv-worker"

# Keep all compute sizing in one place so resource changes are reviewable.
MODAL_RESOURCE_CONFIG = {
    "poll": {"cpu": 0.25, "memory": 512, "timeout": 90, "max_containers": 1},
    "standard": {"cpu": 2, "memory": 4096, "timeout": 10_800, "max_containers": 2},
    "copy": {"cpu": 0.5, "memory": 1024, "timeout": 3600, "max_containers": 1},
    "maintenance": {"cpu": 0.5, "memory": 512, "timeout": 1800, "max_containers": 1},
    "wake": {"timeout": 30, "max_containers": 1},
}

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("ffmpeg")
    .pip_install("fastapi")
    .workdir("/app")
    .add_local_file(str(HERE / "runner.py"), remote_path="/app/runner.py")
    .add_local_file(str(HERE / "transcode.py"), remote_path="/app/transcode.py")
)

app = modal.App(APP_NAME)
worker_secret = modal.Secret.from_name(SECRET_NAME)


@app.function(
    image=image,
    secrets=[worker_secret],
    schedule=modal.Period(seconds=300),
    **MODAL_RESOURCE_CONFIG["poll"],
)
def poll_firestore_queue() -> None:
    """Slow fallback poll; each invocation exits when no job is available."""
    import runner

    try:
        runner.signed_request("POST", "/api/public/v1/worker/maintenance/schedule-wallet-holds", {})
    except Exception:
        # The next five-minute poll retries the idempotent expiry scheduler.
        print("Wallet hold expiry sweep could not be scheduled.", flush=True)

    response = runner.signed_request("POST", "/api/public/v1/worker/jobs/claim", {})
    job = response.get("job")
    if job:
        transcode_claimed_job.spawn(job)
    # Maintenance uses the same existing queue and worker identity. Do not
    # starve cleanup, reconciliation or storage operations while films queue.
    maintenance = runner.signed_request("POST", "/api/public/v1/worker/maintenance/claim", {})
    task = maintenance.get("task")
    if task:
        run_maintenance_task.spawn(task)


@app.function(
    image=image,
    secrets=[worker_secret],
    **MODAL_RESOURCE_CONFIG["maintenance"],
)
def run_maintenance_task(task: dict) -> None:
    import runner

    runner.process_maintenance_task(task)


@app.function(
    image=image,
    secrets=[worker_secret],
    **MODAL_RESOURCE_CONFIG["standard"],
)
def transcode_claimed_job(job: dict) -> None:
    """Execute one job from the existing Firestore queue."""
    import runner

    asset_id = str(job.get("assetId", "unknown"))
    job["modalCores"] = float(MODAL_RESOURCE_CONFIG["standard"]["cpu"])
    job["modalMemoryGiB"] = float(MODAL_RESOURCE_CONFIG["standard"]["memory"]) / 1024
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
            # Lease recovery remains the final safety net.
            pass
        raise


@app.function(
    image=image,
    secrets=[worker_secret],
    schedule=modal.Period(seconds=86400),
    **MODAL_RESOURCE_CONFIG["maintenance"],
)
def rebuild_storage_pool_index() -> None:
    """Refresh compact destination shards and shared capacity summaries nightly."""
    import runner

    runner.signed_request("POST", "/api/public/v1/worker/maintenance/rebuild-pool", {})


@app.function(
    image=image,
    secrets=[worker_secret],
    schedule=modal.Period(seconds=604800),
    **MODAL_RESOURCE_CONFIG["maintenance"],
)
def schedule_storage_maintenance() -> None:
    """Queue one bounded health-and-usage sweep per registered storage location weekly."""
    import runner

    runner.signed_request("POST", "/api/public/v1/worker/maintenance/schedule", {})


@app.function(image=image, secrets=[worker_secret], **MODAL_RESOURCE_CONFIG["wake"])
@modal.fastapi_endpoint(method="POST")
def wake(request: Request) -> dict:
    """Secured, short-lived wake hook called when a source upload is queued."""
    expected = os.environ.get("MODAL_WAKE_SECRET", "")
    supplied = request.headers.get("authorization", "")
    if not expected or len(expected) < 32 or not hmac.compare_digest(supplied, "Bearer " + expected):
        raise HTTPException(status_code=401, detail="Unauthorized")
    poll_firestore_queue.spawn()
    return {"accepted": True}
