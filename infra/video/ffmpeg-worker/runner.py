#!/usr/bin/env python3
"""Authenticated polling runner for the BQ SQWAD TV transcode queue."""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API_BASE = os.environ.get("BQ_TV_API_BASE_URL", "").rstrip("/")
WORKER_SECRET = os.environ.get("STREAMING_HMAC_SECRET", "")
POLL_SECONDS = max(5, int(os.environ.get("WORKER_POLL_SECONDS", "15")))
MAX_SOURCE_BYTES = 5 * 1024 * 1024 * 1024


def signed_request(method: str, path: str, payload: dict | None = None) -> dict:
    if not API_BASE.startswith("https://") or len(WORKER_SECRET) < 32:
        raise RuntimeError("Worker API URL or signing secret is not configured.")
    body = json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_hash = hashlib.sha256(body).hexdigest()
    message = "\\n".join([timestamp, nonce, method.upper(), path, body_hash]).encode()
    derived_key = hmac.new(WORKER_SECRET.encode(), b"BQ-SQWAD-TV:VIDEO-WORKER:V1", hashlib.sha256).digest()
    signature = hmac.new(derived_key, message, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        API_BASE + path,
        data=body,
        method=method.upper(),
        headers={
            "content-type": "application/json",
            "x-bq-worker-time": timestamp,
            "x-bq-worker-nonce": nonce,
            "x-bq-worker-signature": signature,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise RuntimeError("Worker API response is too large.")
            return json.loads(raw or b"{}")
    except urllib.error.HTTPError as error:
        error.read(4096)
        raise RuntimeError("Worker API request failed with HTTP " + str(error.code)) from None
    except (urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Worker API is temporarily unavailable.") from error


def download_source(url: str, destination: Path, expected_size: int) -> None:
    request = urllib.request.Request(url, headers={"Accept-Encoding": "identity"})
    total = 0
    with urllib.request.urlopen(request, timeout=60) as response, destination.open("wb") as output:
        declared = response.headers.get("Content-Length")
        if declared and int(declared) != expected_size:
            raise RuntimeError("Source size does not match the queued asset.")
        while True:
            chunk = response.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > MAX_SOURCE_BYTES or total > expected_size:
                raise RuntimeError("Source download exceeded its declared size.")
            output.write(chunk)
    if total != expected_size:
        raise RuntimeError("Source download was incomplete.")


def upload_file(job: dict, file_path: Path, root: Path) -> dict:
    relative = file_path.relative_to(root).as_posix()
    object_key = job["outputPrefix"] + "/" + relative
    content_type = "application/vnd.apple.mpegurl" if file_path.suffix == ".m3u8" else "video/mp2t"
    target = signed_request("POST", f"/api/public/v1/worker/jobs/{job['assetId']}/target", {
        "claimToken": job["claimToken"],
        "objectKey": object_key,
        "contentType": content_type,
    })
    request = urllib.request.Request(
        target["signedUrl"],
        data=file_path.read_bytes(),
        method="PUT",
        headers={"content-type": content_type, "x-upsert": "false"},
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError("Private storage rejected an HLS object.")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        raise RuntimeError("An HLS object could not be uploaded.") from None
    return {"key": object_key, "sizeBytes": file_path.stat().st_size}


def process_job(job: dict) -> None:
    asset_id = job["assetId"]
    extension = Path(str(job.get("sourceFilename", "source.mp4"))).suffix.lower()
    if extension not in {".mp4", ".mov", ".mkv", ".webm"}:
        raise RuntimeError("Queued source file type is not supported.")
    with tempfile.TemporaryDirectory(prefix="bq-tv-worker-") as temporary:
        root = Path(temporary)
        source = root / ("source" + extension)
        output = root / "hls"
        download_source(job["sourceDownloadUrl"], source, int(job["sourceSizeBytes"]))
        command = [
            "python", "/app/transcode.py", "--input", str(source),
            "--output", str(output), "--threads", str(max(1, min(8, int(os.environ.get("FFMPEG_THREADS", "2"))))),
        ]
        completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if completed.returncode != 0:
            raise RuntimeError("FFmpeg processing failed.")
        files = sorted(path for path in output.rglob("*") if path.is_file())
        if not files or not (output / "master.m3u8").is_file():
            raise RuntimeError("The transcoder did not produce a valid HLS master playlist.")
        manifest = [upload_file(job, file_path, output) for file_path in files]
        signed_request("POST", f"/api/public/v1/worker/jobs/{asset_id}/complete", {
            "claimToken": job["claimToken"], "files": manifest,
        })


def run_forever() -> None:
    if not API_BASE.startswith("https://") or len(WORKER_SECRET) < 32:
        raise SystemExit("Set BQ_TV_API_BASE_URL and STREAMING_HMAC_SECRET before starting the worker.")
    print("BQ SQWAD TV video worker started; waiting for jobs.", flush=True)
    while True:
        try:
            response = signed_request("POST", "/api/public/v1/worker/jobs/claim", {})
            job = response.get("job")
            if not job:
                time.sleep(POLL_SECONDS)
                continue
            try:
                process_job(job)
                print("Completed asset " + str(job["assetId"]), flush=True)
            except Exception:
                try:
                    signed_request("POST", f"/api/public/v1/worker/jobs/{job['assetId']}/fail", {
                        "claimToken": job["claimToken"], "errorCode": "WORKER_PROCESSING_FAILED",
                    })
                except Exception:
                    pass
                print("Processing failed for asset " + str(job.get("assetId", "unknown")), flush=True)
        except Exception:
            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    run_forever()
