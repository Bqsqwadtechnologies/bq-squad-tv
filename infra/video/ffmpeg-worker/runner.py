#!/usr/bin/env python3
"""Authenticated polling runner for the BQ SQWAD TV transcode queue."""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
from concurrent.futures import ThreadPoolExecutor, as_completed
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


def canonical_message(timestamp: str, nonce: str, method: str, path: str, body_hash: str) -> bytes:
    """Match the server verifier's newline-delimited HMAC canonical request."""
    return "\n".join([timestamp, nonce, method.upper(), path, body_hash]).encode()


def signed_request(method: str, path: str, payload: dict | None = None) -> dict:
    if not API_BASE.startswith("https://") or len(WORKER_SECRET) < 32:
        raise RuntimeError("Worker API URL or signing secret is not configured.")
    body = json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_hash = hashlib.sha256(body).hexdigest()
    message = canonical_message(timestamp, nonce, method, path, body_hash)
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


def content_type_for(path: Path) -> str:
    return {
        ".m3u8": "application/vnd.apple.mpegurl",
        ".ts": "video/mp2t",
        ".m4s": "video/iso.segment",
        ".mp4": "video/mp4",
        ".vtt": "text/vtt",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".aac": "audio/aac",
    }.get(path.suffix.lower(), "application/octet-stream")


def iter_file_chunks(file_path: Path):
    with file_path.open("rb") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            yield chunk


def upload_file(job: dict, file_path: Path, root: Path, target: dict, lease_lost: threading.Event) -> dict:
    if lease_lost.is_set():
        raise RuntimeError("The processing lease was lost.")
    request = urllib.request.Request(
        target["signedUrl"],
        data=iter_file_chunks(file_path),
        method="PUT",
        headers={
            "content-type": content_type_for(file_path),
            "Content-Length": str(file_path.stat().st_size),
            "Cache-Control": "public, max-age=31536000, immutable",
            "x-upsert": "false",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError("Private storage rejected an HLS object.")
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        raise RuntimeError("An HLS object could not be uploaded.") from None
    if lease_lost.is_set():
        raise RuntimeError("The processing lease was lost.")
    result = {"key": target["objectKey"], "sizeBytes": file_path.stat().st_size}
    if file_path.suffix.lower() in {".ts", ".m4s"}:
        file_path.unlink(missing_ok=True)
    return result


def process_job(job: dict) -> None:
    asset_id = job["assetId"]
    extension = Path(str(job.get("sourceFilename", "source.mp4"))).suffix.lower()
    if extension not in {".mp4", ".mov", ".mkv", ".webm"}:
        raise RuntimeError("Queued source file type is not supported.")
    with tempfile.TemporaryDirectory(prefix="bq-tv-worker-") as temporary:
        root = Path(temporary)
        source = root / ("source" + extension)
        output = root / "hls"
        lease_lost = threading.Event()
        stage = {"name": "download", "progress": 0.0}
        stage_lock = threading.Lock()

        def update_stage(name: str, progress: float) -> None:
            with stage_lock:
                stage["name"] = name
                stage["progress"] = max(0.0, min(100.0, progress))

        def ensure_lease() -> None:
            if lease_lost.is_set():
                raise RuntimeError("The processing lease was lost.")

        def renew_lease() -> None:
            while not lease_lost.wait(30):
                try:
                    with stage_lock:
                        payload = {
                            "claimToken": job["claimToken"],
                            "stage": stage["name"],
                            "progress": stage["progress"],
                        }
                    signed_request("POST", f"/api/public/v1/worker/jobs/{asset_id}/heartbeat", payload)
                except Exception:
                    lease_lost.set()
                    return

        heartbeat = threading.Thread(target=renew_lease, daemon=True)
        heartbeat.start()
        try:
            ensure_lease()
            download_source(job["sourceDownloadUrl"], source, int(job["sourceSizeBytes"]))
            ensure_lease()
            update_stage("encode", 0)
            command = [
                "python", "/app/transcode.py", "--input", str(source),
                "--output", str(output), "--threads", str(max(1, min(8, int(os.environ.get("FFMPEG_THREADS", "2"))))),
            ]
            completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
            ensure_lease()
            if completed.returncode != 0:
                raise RuntimeError("Media processing failed.")
            files = sorted(
                (path for path in output.rglob("*") if path.is_file()),
                key=lambda path: (
                    2 if path.name == "master.m3u8" else
                    1 if path.suffix.lower() == ".m3u8" else 0,
                    path.as_posix(),
                ),
            )
            if not files or not (output / "master.m3u8").is_file():
                raise RuntimeError("The transcoder did not produce a valid HLS master playlist.")

            update_stage("upload", 0)
            manifest = []
            uploaded_count = 0
            for offset in range(0, len(files), 50):
                ensure_lease()
                batch = files[offset:offset + 50]
                target_response = signed_request(
                    "POST",
                    f"/api/public/v1/worker/jobs/{asset_id}/targets",
                    {
                        "claimToken": job["claimToken"],
                        "files": [
                            {
                                "relativePath": path.relative_to(output).as_posix(),
                                "contentType": content_type_for(path),
                            }
                            for path in batch
                        ],
                    },
                )
                targets = target_response.get("targets", [])
                if len(targets) != len(batch):
                    raise RuntimeError("The storage service returned an incomplete upload target batch.")
                target_by_path = {target["relativePath"]: target for target in targets}
                with ThreadPoolExecutor(max_workers=6) as pool:
                    futures = [
                        pool.submit(
                            upload_file, job, path, output,
                            target_by_path[path.relative_to(output).as_posix()],
                            lease_lost,
                        )
                        for path in batch
                    ]
                    for future in as_completed(futures):
                        ensure_lease()
                        manifest.append(future.result())
                        uploaded_count += 1
                        update_stage("upload", uploaded_count * 100 / len(files))

            ensure_lease()
            update_stage("verify", 100)
            signed_request("POST", f"/api/public/v1/worker/jobs/{asset_id}/complete", {
                "claimToken": job["claimToken"], "files": manifest,
            })
        finally:
            lease_lost.set()
            heartbeat.join(timeout=2)


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
