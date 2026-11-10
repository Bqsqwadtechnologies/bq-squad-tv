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
