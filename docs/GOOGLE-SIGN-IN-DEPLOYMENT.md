# Google sign-in deployment checklist

## Canonical website origin

The repository's Android setup and deployment handoff identify **`https://tv.bqsqwad.com`** as the production API/site host. The hostname `viewer.bqsqwad.tv` does not appear in the repository configuration and must not be treated as an alias without an explicit DNS and deployment decision.

The website session cookie uses the `__Host-` prefix with `Secure`, `Path=/`, and no `Domain` attribute. It is intentionally host-only. A sign-in on `tv.bqsqwad.com` will not create a session on another hostname. Keep this protection; do not broaden cookie scope to make unrelated hosts share sessions.

## Website deployment configuration

- Set `GOOGLE_WEB_CLIENT_ID` to the Firebase project's **Web application OAuth client ID**. The legacy `web_client_id` alias is also supported.
- The value is a public OAuth client ID, not a client secret. Never place a client secret in browser code.
- Deploy the website to `https://tv.bqsqwad.com` and use that exact origin in Google OAuth JavaScript origins.
- Add `tv.bqsqwad.com` to Firebase Authentication's authorized domains.
- In Firebase Authentication, enable the Google provider and confirm its project support email and Web SDK configuration.
- Keep the Firebase project API key and Web App ID aligned with the same Firebase project used by the server.
- Confirm that the deployed response CSP permits Google Identity Services and Firebase Identity Toolkit. The repository CSP now explicitly allows the Google sign-in script/frame and the required Google/Firebase authentication connections.

## Diagnostics now exposed in the UI

The account page distinguishes:
- missing Google OAuth client ID (deployment configuration);
- inability to retrieve the auth config endpoint (network/server);
- Google Identity Services script load failure (network/CSP/browser blocking);
- Google button initialization failure (OAuth client/origin mismatch);
- Firebase credential exchange failure (provider/configuration/credential error);
- secure website session establishment failure (server/App Check/session).

The browser never receives private OAuth secrets. Client-side diagnostics must not include ID tokens, refresh tokens, passwords, or App Check tokens.

## Deployment-only verification

Repository changes cannot verify Firebase Console settings, DNS, hosting environment secrets, or the live response headers. After deployment, test Google sign-in from the canonical `https://tv.bqsqwad.com/account` origin in a clean browser session, then confirm the `/api/public/v1/auth/web/me` response contains the signed-in UID and verified email. Also test sign-out and confirm the host-only session cookie is cleared.

Do not configure `viewer.bqsqwad.tv` as a second production origin unless DNS, hosting, Firebase authorized domains, and Google OAuth JavaScript origins are intentionally configured for it.
