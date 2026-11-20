---
slug: integrating-a-channel
title: Integrating a Channel & Stream Ingest
audience: producer
updatedAt: 2026-11-20
related: [getting-started, troubleshooting, rights-and-copyright]
---

# Integrating a Channel & Stream Ingest

This document details stream delivery standards, manifest guidelines, failover configuration, and technical validation requirements.

## Channel Details {#channel-details}
Each registered channel requires descriptive metadata:
- **Display Name**: Official broadcast title displayed across viewer guides and search.
- **Category & Language**: Accurate genre categorization and primary spoken language.
- **Artwork**: High-resolution 16:9 landscape backdrop and 1:1 channel logo.

## Stream Source Specifications {#stream-source}
BQ SQWAD TV operates an HLS pull architecture:
- **Format**: HTTP Live Streaming (HLS) with `.m3u8` master playlist.
- **Video Codec**: H.264 (AVC) Main or High profile.
- **Audio Codec**: AAC-LC stereo at 128 kbps or 192 kbps, 48 kHz.
- **GOP Cadence**: Closed GOP with keyframe interval of 2.0 seconds.
- **Segment Duration**: 4.0 or 6.0 seconds per `.ts` or `.m4s` segment.

## Backup Stream Source {#backup-source}
Broadcasters are advised to configure a redundant secondary stream URL hosted on isolated infrastructure. In the event of primary endpoint degradation, the delivery network automatically switches ingest feeds without viewer session disruption.

## Bandwidth Cap {#bandwidth-cap}
Channels are provisioned with dedicated edge bandwidth limits (standard allocation up to 8.0 Gbps). Peak concurrency alerts notify your operations team if traffic approaches provisioned limits.

## Test Stream Validation {#test-stream}
Before submitting a channel for review, you must complete an automated test playback inside the console. The test inspects:
- Playlist syntax and sub-stream bitrates.
- Continuous audio and video frame timestamps.
- Edge fetch round-trip latency.
