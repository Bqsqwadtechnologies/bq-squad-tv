# BQ SQWAD TV delivery roadmap

- [ ] Read existing Firestore collections and fields — a read-only, Firebase-admin-authenticated inspector is ready; requires an administrator Firebase ID token and successful database access.
- [ ] Implement and verify the shared Firebase-backed API — waiting for the inspected schema and confirmed database permissions.
- [ ] Implement Paystack checkout and idempotent wallet crediting — waiting for the existing payment/wallet schema.
- [ ] Verify Google Play purchases — blocked: no dedicated `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`; the Firebase account receives `PERMISSION_DENIED` from Android Publisher API.
- [ ] Enable playback — waiting for a selected streaming provider, licensed streams, and rights data.
- [x] Keep the website and shared API hosted on Lovable; Android remains a native client.