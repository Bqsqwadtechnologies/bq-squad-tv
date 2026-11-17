#!/usr/bin/env python3
"""Authenticated polling runner for the BQ SQWAD TV transcode queue."""
from __future__ import annotations

import base64
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
WORKER_ID = os.environ.get("VIDEO_WORKER_ID", "legacy-shared")
try:
    WORKER_KEYS = json.loads(os.environ.get("VIDEO_WORKER_KEYS_JSON", "{}"))
except json.JSONDecodeError:
    WORKER_KEYS = {}
POLL_SECONDS = max(5, int(os.environ.get("WORKER_POLL_SECONDS", "15")))
MAX_SOURCE_BYTES = 5 * 1024 * 1024 * 1024


def canonical_message(timestamp: str, nonce: str, method: str, path: str, body_hash: str) -> bytes:
    """Match the server verifier's newline-delimited HMAC canonical request."""
    return "\n".join([timestamp, nonce, method.upper(), path, body_hash]).encode()


def signed_request(method: str, path: str, payload: dict | None = None) -> dict:
    if not API_BASE.startswith("https://"):
        raise RuntimeError("Worker API URL is not configured.")
    if WORKER_KEYS:
        secret = WORKER_KEYS.get(WORKER_ID)
        if not isinstance(secret, str) or len(secret) < 48:
            raise RuntimeError("This processing worker has no valid individual credential.")
        derived_key = secret.encode()
    else:
        if WORKER_ID != "legacy-shared" or len(WORKER_SECRET) < 32:
            raise RuntimeError("Worker signing credentials are not configured.")
        derived_key = hmac.new(WORKER_SECRET.encode(), b"BQ-SQWAD-TV:VIDEO-WORKER:V1", hashlib.sha256).digest()
    body = json.dumps(payload or {}, separators=(",", ":"), ensure_ascii=False).encode()
    timestamp = str(int(time.time()))
    nonce = secrets.token_hex(16)
    body_hash = hashlib.sha256(body).hexdigest()
    message = canonical_message(timestamp, nonce, method, path, body_hash)
    signature = hmac.new(derived_key, message, hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        API_BASE + path,
        data=body,
        method=method.upper(),
        headers={
            "content-type": "application/json",
            "x-bq-worker-id": WORKER_ID,
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


def download_source(
    url: str,
    destination: Path,
    expected_size: int,
    lease_lost: threading.Event | None = None,
) -> None:
    partial = destination.with_suffix(destination.suffix + ".part")
    if expected_size <= 0 or expected_size > MAX_SOURCE_BYTES:
        raise RuntimeError("SOURCE_SIZE_INVALID")
    for attempt in range(4):
        if lease_lost is not None and lease_lost.is_set():
            raise RuntimeError("WORKER_LEASE_LOST")
        offset = partial.stat().st_size if partial.exists() else 0
        if offset > expected_size:
            partial.unlink(missing_ok=True)
            offset = 0
        if offset == expected_size:
            partial.replace(destination)
            return
        headers = {"Accept-Encoding": "identity"}
        if offset:
            headers["Range"] = f"bytes={offset}-"
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                if offset and response.status != 206:
                    offset = 0
                if offset:
                    content_range = response.headers.get("Content-Range", "")
                    if not content_range.startswith(f"bytes {offset}-"):
                        raise RuntimeError("SOURCE_RANGE_INVALID")
                declared = response.headers.get("Content-Length")
                expected_remaining = expected_size - offset
                if declared and int(declared) != expected_remaining:
                    if offset:
                        raise RuntimeError("SOURCE_RANGE_SIZE_INVALID")
                    raise RuntimeError("SOURCE_SIZE_MISMATCH")
                total = offset
                mode = "ab" if offset else "wb"
                with partial.open(mode) as output:
                    while True:
                        if lease_lost is not None and lease_lost.is_set():
                            raise RuntimeError("WORKER_LEASE_LOST")
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > MAX_SOURCE_BYTES or total > expected_size:
                            raise RuntimeError("SOURCE_SIZE_LIMIT")
                        output.write(chunk)
                if total == expected_size:
                    partial.replace(destination)
                    return
                if total < expected_size:
                    continue
                raise RuntimeError("SOURCE_SIZE_MISMATCH")
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 3:
                raise RuntimeError("SOURCE_DOWNLOAD_FAILED") from None
    raise RuntimeError("SOURCE_DOWNLOAD_INCOMPLETE")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while True:
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


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


def iter_file_chunks(file_path: Path, lease_lost: threading.Event):
    with file_path.open("rb") as source:
        while True:
            if lease_lost.is_set():
                raise RuntimeError("WORKER_LEASE_LOST")
            chunk = source.read(1024 * 1024)
            if not chunk:
                break
            yield chunk


def upload_file(job: dict, file_path: Path, root: Path, target: dict, lease_lost: threading.Event) -> dict:
    file_size = file_path.stat().st_size
    if file_size <= 0 or file_size > 2 * 1024 * 1024 * 1024:
        raise RuntimeError("OUTPUT_FILE_SIZE_INVALID")
    for attempt in range(5):
        if lease_lost.is_set():
            raise RuntimeError("WORKER_LEASE_LOST")
        request = urllib.request.Request(
            target["signedUrl"],
            data=iter_file_chunks(file_path, lease_lost),
            method="PUT",
            headers={
                "content-type": content_type_for(file_path),
                "Content-Length": str(file_size),
                "Cache-Control": "public, max-age=31536000, immutable",
                "x-upsert": "false",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                if response.status not in (200, 201, 204):
                    raise RuntimeError("STORAGE_UPLOAD_REJECTED")
            if lease_lost.is_set():
                raise RuntimeError("WORKER_LEASE_LOST")
            result = {"key": target["objectKey"], "sizeBytes": file_size}
            if file_path.suffix.lower() in {".ts", ".m4s"}:
                file_path.unlink(missing_ok=True)
            return result
        except RuntimeError:
            raise
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ConnectionError):
            if lease_lost.is_set():
                raise RuntimeError("WORKER_LEASE_LOST") from None
            if attempt == 4:
                raise RuntimeError("STORAGE_UPLOAD_FAILED") from None
            time.sleep(2 ** attempt)
    raise RuntimeError("STORAGE_UPLOAD_FAILED")


def process_job(job: dict) -> None:
    started_at = time.monotonic()
    asset_id = job["assetId"]
    extension = Path(str(job.get("sourceFilename", "source.mp4"))).suffix.lower()
    if extension not in {".mp4", ".mov", ".mkv", ".webm"}:
        raise RuntimeError("Queued source file type is not supported.")
    with tempfile.TemporaryDirectory(prefix="bq-tv-worker-") as temporary:
        root = Path(temporary)
        root.chmod(0o700)
        required_free_bytes = int(job["sourceSizeBytes"]) * 4 + 2 * 1024 * 1024 * 1024
        if shutil.disk_usage(root).free < required_free_bytes:
            raise RuntimeError("WORKER_DISK_SPACE_LOW")
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
                raise RuntimeError("WORKER_LEASE_LOST")

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
            download_source(job["sourceDownloadUrl"], source, int(job["sourceSizeBytes"]), lease_lost)
            ensure_lease()
            source_sha256 = sha256_file(source)
            expected_hash = job.get("sourceSha256")
            if expected_hash and not hmac.compare_digest(str(expected_hash).lower(), source_sha256):
                raise RuntimeError("SOURCE_HASH_MISMATCH")
            update_stage("encode", 0)
            hls_key_bytes = None
            key_info_path = None
            if job.get("hlsEncryption") is True:
                hls_key_bytes = secrets.token_bytes(16)
                key_path = root / "hls-content.key"
                key_path.write_bytes(hls_key_bytes)
                key_path.chmod(0o600)
                key_info_path = root / "hls-key-info.txt"
                key_uri = API_BASE + "/api/public/v1/streaming/key/" + asset_id
                key_info_path.write_text(key_uri + "\n" + str(key_path) + "\n", encoding="utf-8")
                key_info_path.chmod(0o600)
            command = [
                "nice", "-n", "10", "python", "/app/transcode.py", "--input", str(source),
                "--output", str(output), "--threads", str(max(1, min(8, int(os.environ.get("FFMPEG_THREADS", "2"))))),
                "--profile", str(job.get("profile", "standard")), "--mode", "auto",
            ]
            if key_info_path:
                command.extend(["--key-info-file", str(key_info_path)])
            process = subprocess.Popen(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            while process.poll() is None:
                if lease_lost.wait(1):
                    process.terminate()
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                    raise RuntimeError("WORKER_LEASE_LOST")
            stdout, stderr = process.communicate()
            ensure_lease()
            if process.returncode != 0:
                raise RuntimeError("MEDIA_PROCESSING_FAILED")
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
            elapsed_seconds = max(0, int(time.monotonic() - started_at))
            signed_request("POST", f"/api/public/v1/worker/jobs/{asset_id}/complete", {
                "claimToken": job["claimToken"],
                "sourceSha256": source_sha256,
                "files": manifest,
                **({"hlsEncryptionKey": base64.urlsafe_b64encode(hls_key_bytes).decode("ascii").rstrip("=")} if hls_key_bytes else {}),
                "computeUsage": {
                    "cores": float(job.get("modalCores", 2)),
                    "memoryGiB": float(job.get("modalMemoryGiB", 4)),
                    "seconds": elapsed_seconds,
                },
                "outputResolutions": sorted(
                    int(path.name[1:]) for path in output.iterdir()
                    if path.is_dir() and path.name.startswith("v") and path.name[1:].isdigit()
                ),
            })
        finally:
            lease_lost.set()
            heartbeat.join(timeout=2)


def process_maintenance_task(task: dict) -> None:
    task_id = str(task.get("taskId", ""))
    claim_token = str(task.get("claimToken", ""))
    if not task_id or not claim_token:
        raise RuntimeError("MAINTENANCE_TASK_INVALID")
    deleted = 0
    processed_objects = 0
    usage_bytes = None
    health_status = None
    for _ in range(1000):
        response = signed_request("POST", "/api/public/v1/worker/maintenance/run", {
            "taskId": task_id,
            "claimToken": claim_token,
        })
        deleted += int(response.get("deletedCount", 0))
        if "processedObjectCount" in response:
            processed_objects = int(response.get("processedObjectCount", 0))
        if "usageBytes" in response:
            usage_bytes = int(response["usageBytes"])
        if "healthStatus" in response:
            health_status = str(response["healthStatus"])
        if response.get("yield") is True:
            # Long-running orchestration must release its lease so the same
            # Modal worker can claim the child task it just queued.
            release_payload = {"taskId": task_id, "claimToken": claim_token}
            retry_at = response.get("retryAt")
            if isinstance(retry_at, str):
                release_payload["notBefore"] = retry_at
            signed_request("POST", "/api/public/v1/worker/maintenance/release", release_payload)
            return
        if response.get("done") is not True and task.get("taskType") == "storage_health_usage":
            # One maintenance worker processes provider pages serially. A delay
            # bounds request rate and avoids flooding a shared project/account.
            time.sleep(1.0)
        if response.get("done") is True:
            result = {"deletedObjectCount": deleted, "processedObjectCount": processed_objects}
            if usage_bytes is not None:
                result["usageBytes"] = usage_bytes
            if health_status is not None:
                result["healthStatus"] = health_status
            signed_request("POST", "/api/public/v1/worker/maintenance/complete", {
                "taskId": task_id,
                "claimToken": claim_token,
                "result": result,
            })
            return
    raise RuntimeError("MAINTENANCE_TASK_LIMIT")


def run_forever() -> None:
    if not API_BASE.startswith("https://"):
        raise SystemExit("Set BQ_TV_API_BASE_URL before starting the worker.")
    if WORKER_KEYS:
        if not isinstance(WORKER_KEYS.get(WORKER_ID), str) or len(WORKER_KEYS[WORKER_ID]) < 48:
            raise SystemExit("Set a valid per-worker credential for VIDEO_WORKER_ID.")
    elif WORKER_ID != "legacy-shared" or len(WORKER_SECRET) < 32:
        raise SystemExit("Set VIDEO_WORKER_KEYS_JSON or the temporary legacy worker secret.")
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
