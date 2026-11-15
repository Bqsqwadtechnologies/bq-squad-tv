#!/usr/bin/env python3
"""Generate an adaptive HLS VOD ladder from one locally stored source file.

This worker deliberately performs no network access and does not publish output.
A separately authenticated orchestration service must upload the completed
output directory to private object storage and update the content asset state.
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

MAX_SOURCE_BYTES = 5 * 1024 * 1024 * 1024
ALLOWED_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
TARGET_HEIGHTS = (360, 480, 720, 1080)
VIDEO_BITRATES = {360: 900_000, 480: 1_400_000, 720: 2_800_000, 1080: 5_000_000}
AUDIO_BITRATE = 128_000
SEGMENT_SECONDS = 4


@dataclass(frozen=True)
class Variant:
    width: int
    height: int
    video_bitrate: int

    @property
    def bandwidth(self) -> int:
        return math.ceil((self.video_bitrate + AUDIO_BITRATE) * 1.10)


def build_variant_ladder(source_width: int, source_height: int) -> list[Variant]:
    """Build unique, even-dimension renditions without upscaling the source."""
    if source_width < 2 or source_height < 2:
        raise ValueError("The source video dimensions are invalid.")

    heights: list[int] = []
    for target in TARGET_HEIGHTS:
        height = min(target, source_height)
        height -= height % 2
        if height >= 2 and height not in heights:
            heights.append(height)

    if not heights:
        height = source_height - (source_height % 2)
        if height < 2:
            raise ValueError("The source video is too small to encode.")
        heights.append(height)

    variants: list[Variant] = []
    for height in heights:
        width = max(2, int(source_width * height / source_height))
        width -= width % 2
        variants.append(Variant(width, height, VIDEO_BITRATES.get(height, 500_000)))
    return variants


def run_checked(command: list[str]) -> None:
    completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        details = completed.stderr[-4_000:].strip()
        raise RuntimeError("Media processing failed. " + details)


def probe_source(source: Path) -> tuple[int, int]:
    command = [
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height", "-of", "json", str(source),
    ]
    completed = subprocess.run(command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if completed.returncode != 0:
        raise RuntimeError("The source video could not be inspected.")
    try:
        streams = json.loads(completed.stdout).get("streams", [])
        width = int(streams[0]["width"])
        height = int(streams[0]["height"])
    except (ValueError, TypeError, KeyError, IndexError, json.JSONDecodeError) as error:
        raise RuntimeError("The source does not contain a supported video stream.") from error
    if width < 2 or height < 2:
        raise RuntimeError("The source video dimensions are invalid.")
    return width, height


def write_master_playlist(output_dir: Path, variants: list[Variant]) -> None:
    lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-INDEPENDENT-SEGMENTS"]
    for variant in variants:
        lines.extend([
            f"#EXT-X-STREAM-INF:BANDWIDTH={variant.bandwidth},RESOLUTION={variant.width}x{variant.height}",
            f"v{variant.height}/index.m3u8",
        ])
    temporary = output_dir / "master.m3u8.tmp"
    temporary.write_text("\n".join(lines) + "\n", encoding="utf-8")
    temporary.replace(output_dir / "master.m3u8")



def verify_hls_output(output_dir: Path) -> dict[str, int]:
    """Fail closed unless every master/variant playlist and referenced segment exists."""
    root = output_dir.resolve(strict=True)
    master = root / "master.m3u8"
    if not master.is_file() or master.stat().st_size == 0:
        raise RuntimeError("The HLS master playlist is missing or empty.")
    master_lines = master.read_text(encoding="utf-8").splitlines()
    variant_paths: list[str] = []
    expect_variant = False
    for line in master_lines:
        value = line.strip()
        if value.startswith("#EXT-X-STREAM-INF:"):
            expect_variant = True
        elif value and not value.startswith("#") and expect_variant:
            variant_paths.append(value)
            expect_variant = False
    if expect_variant or not variant_paths:
        raise RuntimeError("The HLS master playlist contains an incomplete or empty rendition list.")

    segment_count = 0
    total_segment_bytes = 0
    for relative_playlist in variant_paths:
        playlist = (root / relative_playlist).resolve()
        if not playlist.is_relative_to(root) or not playlist.is_file() or playlist.stat().st_size == 0:
            raise RuntimeError("An HLS rendition playlist is missing or has an unsafe path.")
        lines = playlist.read_text(encoding="utf-8").splitlines()
        if "#EXT-X-ENDLIST" not in lines:
            raise RuntimeError("An HLS VOD rendition is not finalized.")
        rendition_segments = 0
        for line in lines:
            value = line.strip()
            if not value or value.startswith("#"):
                continue
            segment = (playlist.parent / value).resolve()
            if not segment.is_relative_to(root) or not segment.is_file():
                raise RuntimeError("An HLS segment is missing or has an unsafe path.")
            size = segment.stat().st_size
            if size <= 0:
                raise RuntimeError("An HLS segment is empty.")
            rendition_segments += 1
            segment_count += 1
            total_segment_bytes += size
        if rendition_segments == 0:
            raise RuntimeError("An HLS rendition contains no media segments.")
    return {"renditionCount": len(variant_paths), "segmentCount": segment_count, "segmentBytes": total_segment_bytes}

def transcode(source: Path, output_dir: Path, threads: int) -> list[Variant]:
    source = source.expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError("Use a regular MP4, MOV, MKV or WebM source file.")
    if source.stat().st_size <= 0 or source.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("The source file must be between 1 byte and 5 GiB.")

    output_dir = output_dir.expanduser().resolve()
    if output_dir == source.parent or source.is_relative_to(output_dir):
        raise ValueError("The output directory must not contain or replace the source file.")
    if output_dir.exists() and any(output_dir.iterdir()):
        raise ValueError("The output directory must be empty.")
    output_dir.mkdir(parents=True, exist_ok=True)

    width, height = probe_source(source)
    variants = build_variant_ladder(width, height)
    try:
        for variant in variants:
            variant_dir = output_dir / f"v{variant.height}"
            variant_dir.mkdir(parents=True, exist_ok=True)
            segment_pattern = variant_dir / "segment_%05d.ts"
            command = [
                "ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(source),
                "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1",
                "-vf", f"scale={variant.width}:{variant.height}:flags=lanczos",
                "-c:v", "libx264", "-preset", "veryfast", "-crf", "22",
                "-maxrate", str(variant.video_bitrate), "-bufsize", str(variant.video_bitrate * 2),
                "-pix_fmt", "yuv420p", "-sc_threshold", "0",
                "-force_key_frames", f"expr:gte(t,n_forced*{SEGMENT_SECONDS})",
                "-c:a", "aac", "-b:a", str(AUDIO_BITRATE), "-ac", "2",
                "-threads", str(threads),
                "-f", "hls", "-hls_time", str(SEGMENT_SECONDS),
                "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
                "-hls_segment_filename", str(segment_pattern),
                str(variant_dir / "index.m3u8"),
            ]
            run_checked(command)
        write_master_playlist(output_dir, variants)
        verify_hls_output(output_dir)
    except Exception:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise
    return variants


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcode an authorized source video into adaptive HLS renditions.")
    parser.add_argument("--input", required=True, type=Path, help="Local source video file.")
    parser.add_argument("--output", required=True, type=Path, help="Empty output directory for HLS files.")
    parser.add_argument("--threads", type=int, default=2, choices=range(1, 9), help="FFmpeg CPU thread limit (1-8).")
    args = parser.parse_args()
    try:
        variants = transcode(args.input, args.output, args.threads)
    except (OSError, ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps({
        "status": "transcoded",
        "manifest": str(args.output.resolve() / "master.m3u8"),
        "variants": [{"width": item.width, "height": item.height, "bandwidth": item.bandwidth} for item in variants],
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
