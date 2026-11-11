> **Canonical specification:** [MASTER_TECHNICAL_SPEC.md](MASTER_TECHNICAL_SPEC.md) and [IMPLEMENTATION_BLUEPRINT.md](IMPLEMENTATION_BLUEPRINT.md) define the approved hybrid delivery model. This file is the existing provider integration baseline, not proof that a provider is selected or configured.

# Streaming provider integration

The Android player must receive only a server-issued, short-lived signed HLS or DASH URL from `POST /v1/sessions/start`. Do not embed provider URLs, ingest credentials or secrets in the APK.

The client foundation includes Media3 ExoPlayer HLS/DASH modules, adaptive track selection, TextureView zoom, live seek controls, fullscreen, rotation, PiP, FLAG_SECURE and Cast framework configuration. A fully connected MediaSession controller, Cast session handoff, DRM licence integration and complete ad-video insertion still require implementation and end-to-end testing.

## Provider onboarding
1. Select a licensed streaming/CDN/ingest provider and confirm territory, concurrency, recording and replay rights.
2. Implement a server-side StreamProvider adapter; store provider keys only in Lovable Cloud Secrets.
3. Normalize HLS/DASH manifest, ingest, health, recording-to-replay, subtitles/audio metadata and signed URL expiry.
4. Store rights holder, territories, licence start/end and content rating on each channel/content record.
5. Server checks rights, territory and age before issuing a playback token.
6. For premium streams, integrate Widevine DRM licence acquisition through the server/provider. Never expose licence credentials in the APK.
7. Record live programmes into replay assets only when the licence permits it.

## Cost warning
Streaming costs include ingest, transcoding, origin storage, CDN egress, DVR window, replay storage and DRM. Adaptive bitrate and data saver reduce viewer bandwidth but do not remove provider charges.


## Approved hybrid delivery model

Each content asset selects one delivery mode:

- **External licensed provider:** use only provider-authorized playback and the provider's signed playback/DRM controls. Do not ingest, download, proxy, record or repackage third-party streams unless the agreement expressly permits it.
- **BQ-hosted:** only for content BQ owns or is contractually authorized to host. Use private object storage, secure ingest, adaptive HLS/DASH transcoding, CDN delivery, short-lived signed playback authorization, revocation and cost telemetry.

Both modes pass through the same BQ backend rights, territory, platform, wallet, device-limit and PAYG session checks. Provider credentials and source URLs remain server-side. Source URLs are encrypted at rest using the versioned AES-256-GCM key ring documented in [SECRETS_CHECKLIST.md](SECRETS_CHECKLIST.md). The producer receives a saved confirmation and cannot retrieve plaintext after saving; privileged admin reveal requires reauthentication and audit logging.

## Provider registry status

The server now has a configuration-neutral registry at `src/lib/server/streaming/registry.ts`. It resolves a content asset only when its delivery mode (`external` or `bq_hosted`) and provider ID match a registered adapter, and it rejects assets that are not `ready`. The registry does not select a vendor, create credentials or make an unconfigured provider available. Session-start and playback authorization still need to call the rights gate, resolve the asset's adapter, issue a short-lived grant, persist its authorization reference and revoke it when the session ends.


