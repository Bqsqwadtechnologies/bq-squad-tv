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
PROFILE_HEIGHTS = {
    "economy": (360, 480, 720),
    "standard": (360, 480, 720, 1080),
    "high": (360, 480, 720, 1080),
}
PROFILE_BITRATES = {
    "economy": {360: 600_000, 480: 1_000_000, 720: 1_800_000},
    "standard": {360: 900_000, 480: 1_400_000, 720: 2_800_000, 1080: 5_000_000},
    "high": {360: 1_100_000, 480: 1_800_000, 720: 3_500_000, 1080: 7_000_000},
}
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


def build_variant_ladder(source_width: int, source_height: int, profile: str = "standard") -> list[Variant]:
    """Build unique, even-dimension renditions without upscaling the source."""
    if source_width < 2 or source_height < 2:
        raise ValueError("The source video dimensions are invalid.")

    if profile not in PROFILE_HEIGHTS:
        raise ValueError("The selected processing profile is not supported.")
    heights: list[int] = []
    for target in PROFILE_HEIGHTS[profile]:
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
        variants.append(Variant(width, height, PROFILE_BITRATES[profile].get(height, 500_000)))
    return variants


def run_checked(command: list[str], timeout_seconds: int = 10_800) -> None:
    try:
        completed = subprocess.run(
            command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False, timeout=max(1800, min(21_600, timeout_seconds)),
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("MEDIA_PROCESSING_TIMEOUT") from None
    if completed.returncode != 0:
        raise RuntimeError("MEDIA_PROCESSING_FAILED")


def verify_source_magic(source: Path) -> None:
    with source.open("rb") as media:
        header = media.read(16)
    extension = source.suffix.lower()
    valid = (
        extension in {".mp4", ".mov"} and len(header) >= 8 and header[4:8] == b"ftyp"
    ) or (
        extension == ".mkv" and header.startswith(b"\x1aE\xdf\xa3")
    ) or (
        extension == ".webm" and header.startswith(b"\x1aE\xdf\xa3")
    )
    if not valid:
        raise RuntimeError("SOURCE_SIGNATURE_INVALID")


def probe_source(source: Path) -> tuple[int, int, float, str, str]:
    command = [
        "ffprobe", "-v", "error", "-protocol_whitelist", "file,pipe",
        "-probesize", "10000000", "-analyzeduration", "10000000",
        "-show_entries", "format=format_name,duration:stream=codec_type,codec_name,width,height",
        "-of", "json", str(source),
    ]
    try:
        completed = subprocess.run(
            command, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            check=False, timeout=60,
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("SOURCE_INSPECTION_TIMEOUT") from None
    if completed.returncode != 0:
        raise RuntimeError("SOURCE_INSPECTION_FAILED")
    try:
        payload = json.loads(completed.stdout)
        streams = payload.get("streams", [])
        video = next(item for item in streams if item.get("codec_type") == "video")
        width = int(video["width"])
        height = int(video["height"])
        duration = float(payload.get("format", {}).get("duration", 0))
        container = str(payload.get("format", {}).get("format_name", ""))
        video_codec = str(video.get("codec_name", ""))
        audio_stream = next((item for item in streams if item.get("codec_type") == "audio"), {})
        audio_codec = str(audio_stream.get("codec_name", ""))
    except (ValueError, TypeError, KeyError, StopIteration, json.JSONDecodeError):
        raise RuntimeError("SOURCE_MEDIA_UNSUPPORTED") from None
    allowed_containers = {"mov", "mp4", "m4a", "3gp", "3g2", "mj2", "matroska", "webm"}
    allowed_video = {"h264", "hevc", "vp9", "av1", "mpeg4"}
    allowed_audio = {"aac", "opus", "vorbis", "mp3", "ac3", "eac3", "flac", "pcm_s16le"}
    if not any(item in allowed_containers for item in container.split(",")) or video_codec not in allowed_video:
        raise RuntimeError("SOURCE_CODEC_UNSUPPORTED")
    for stream in streams:
        if stream.get("codec_type") == "audio" and stream.get("codec_name") not in allowed_audio:
            raise RuntimeError("SOURCE_AUDIO_CODEC_UNSUPPORTED")
    if width < 2 or height < 2 or width > 3840 or height > 2160:
        raise RuntimeError("SOURCE_RESOLUTION_UNSUPPORTED")
    if duration <= 0 or duration > 6 * 60 * 60:
        raise RuntimeError("SOURCE_DURATION_UNSUPPORTED")
    return width, height, duration, video_codec, audio_codec


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
            if size <= 0 or size > 2 * 1024 * 1024 * 1024:
                raise RuntimeError("An HLS segment is empty or exceeds the file size limit.")
            rendition_segments += 1
            segment_count += 1
            total_segment_bytes += size
        if rendition_segments == 0:
            raise RuntimeError("An HLS rendition contains no media segments.")
    return {"renditionCount": len(variant_paths), "segmentCount": segment_count, "segmentBytes": total_segment_bytes}

def generate_artwork(source: Path, output_dir: Path, duration: float, timeout_seconds: int) -> list[Path]:
    """Create one poster, five seek thumbnails and a contact-sheet sprite."""
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError("The source duration is invalid for artwork generation.")

    outputs: list[Path] = []
    samples = (
        ("poster.jpg", 0.05),
        ("thumbnail_01.jpg", 0.15),
        ("thumbnail_02.jpg", 0.32),
        ("thumbnail_03.jpg", 0.50),
        ("thumbnail_04.jpg", 0.68),
        ("thumbnail_05.jpg", 0.85),
    )
    for filename, fraction in samples:
        timestamp = min(max(0.0, duration - 0.1), duration * fraction)
        target = output_dir / filename
        command = [
            "ffmpeg", "-hide_banner", "-nostdin", "-y",
            "-ss", f"{timestamp:.3f}", "-i", str(source),
            "-map", "0:v:0", "-frames:v", "1",
            "-vf", "scale='min(640,iw)':-2",
            "-q:v", "3", "-threads", "1", str(target),
        ]
        run_checked(command, min(timeout_seconds, 600))
        if not target.is_file() or target.stat().st_size < 1 or target.stat().st_size > 10 * 1024 * 1024:
            raise RuntimeError("MEDIA_ARTWORK_INVALID")
        outputs.append(target)

    sprite = output_dir / "sprite.jpg"
    inputs = [output_dir / f"thumbnail_{index:02d}.jpg" for index in range(1, 6)]
    filters = [
        f"[{index}:v]scale=320:180:force_original_aspect_ratio=decrease,"
        f"pad=320:180:(ow-iw)/2:(oh-ih)/2,setsar=1[v{index}]"
        for index in range(5)
    ]
    layout = "|".join(f"{index * 320}_0" for index in range(5))
    filters.append("".join(f"[v{index}]" for index in range(5)) +
                   f"xstack=inputs=5:layout={layout}:fill=black[out]")
    sprite_command = [
        "ffmpeg", "-hide_banner", "-nostdin", "-y",
        *[argument for path in inputs for argument in ("-i", str(path))],
        "-filter_complex", ";".join(filters), "-map", "[out]",
        "-frames:v", "1", "-q:v", "4", "-threads", "1", str(sprite),
    ]
    run_checked(sprite_command, min(timeout_seconds, 600))
    if not sprite.is_file() or sprite.stat().st_size < 1 or sprite.stat().st_size > 20 * 1024 * 1024:
        raise RuntimeError("MEDIA_SPRITE_INVALID")
    outputs.append(sprite)
    return outputs


def transcode(
    source: Path,
    output_dir: Path,
    threads: int,
    profile: str = "standard",
    mode: str = "auto",
    key_info_file: Path | None = None,
) -> list[Variant]:
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

    verify_source_magic(source)
    width, height, duration, video_codec, audio_codec = probe_source(source)
    processing_timeout = max(1800, int(duration * 6))
    variants = build_variant_ladder(width, height, profile)
    try:
        if mode not in {"auto", "copy", "encode"}:
            raise ValueError("The processing mode is not supported.")
        if mode != "encode" and video_codec == "h264" and audio_codec == "aac" and height <= 1080:
            native_height = max(2, height - (height % 2))
            native_width = max(2, width - (width % 2))
            native_variant = Variant(native_width, native_height, PROFILE_BITRATES[profile].get(native_height, 500_000))
            native_dir = output_dir / f"v{native_height}"
            native_dir.mkdir(parents=True, exist_ok=True)
            copy_command = [
                "ffmpeg", "-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file,pipe",
                "-i", str(source), "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn",
                *(["-hls_key_info_file", str(key_info_file)] if key_info_file else []),
                "-c", "copy", "-f", "hls", "-hls_time", str(SEGMENT_SECONDS),
                "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
                "-hls_segment_filename", str(native_dir / "segment_%05d.ts"),
                str(native_dir / "index.m3u8"),
            ]
            try:
                run_checked(copy_command, processing_timeout)
                durations = [
                    float(line.split(":", 1)[1].split(",", 1)[0])
                    for line in (native_dir / "index.m3u8").read_text(encoding="utf-8").splitlines()
                    if line.startswith("#EXTINF:")
                ]
                if durations and max(durations) <= 20:
                    write_master_playlist(output_dir, [native_variant])
                    verify_hls_output(output_dir)
                    generate_artwork(source, output_dir, duration, processing_timeout)
                    return [native_variant]
            except (OSError, RuntimeError, ValueError):
                pass
            shutil.rmtree(native_dir, ignore_errors=True)
            (output_dir / "master.m3u8").unlink(missing_ok=True)

        for variant in variants:
            variant_dir = output_dir / f"v{variant.height}"
            variant_dir.mkdir(parents=True, exist_ok=True)
            segment_pattern = variant_dir / "segment_%05d.ts"
            command = [
                "ffmpeg", "-hide_banner", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-i", str(source),
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
                *(["-hls_key_info_file", str(key_info_file)] if key_info_file else []),
                "-hls_segment_filename", str(segment_pattern),
                str(variant_dir / "index.m3u8"),
            ]
            run_checked(command, processing_timeout)
        write_master_playlist(output_dir, variants)
        verify_hls_output(output_dir)
        generate_artwork(source, output_dir, duration, processing_timeout)
    except Exception:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise
    return variants


def main() -> int:
    parser = argparse.ArgumentParser(description="Transcode an authorized source video into adaptive HLS renditions.")
    parser.add_argument("--input", required=True, type=Path, help="Local source video file.")
    parser.add_argument("--output", required=True, type=Path, help="Empty output directory for HLS files.")
    parser.add_argument("--threads", type=int, default=2, choices=range(1, 9), help="FFmpeg CPU thread limit (1-8).")
    parser.add_argument("--profile", choices=("economy", "standard", "high"), default="standard")
    parser.add_argument("--mode", choices=("auto", "copy", "encode"), default="auto")
    parser.add_argument("--key-info-file", type=Path, default=None)
    args = parser.parse_args()
    try:
        variants = transcode(args.input, args.output, args.threads, args.profile, args.mode, args.key_info_file)
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
