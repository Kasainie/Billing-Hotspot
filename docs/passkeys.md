# Passkey sign-in

LKTECH supports discoverable WebAuthn passkeys alongside password and Google sign-in. Signed-in users can register and remove passkeys under **Settings → Account → Password & passkeys**. Passkey registration requires a verified account, a browser with WebAuthn support, and a secure origin.

For local development, open the app at `http://localhost:3000` (not `http://127.0.0.1:3000`) so the browser and Windows passkey provider use the expected relying-party domain. If Windows Security reports that it could not save a passkey, verify that Windows Hello is configured with a PIN or biometrics, then retry from a supported browser. Production registration requires the configured RP ID to match the HTTPS app host.

## Database

Apply `supabase/migrations/20261020130000_add_passkey_authentication.sql` before deploying the passkey API. It creates the credential table and short-lived, single-use challenge store. Credential public keys and authenticator counters are stored for signature verification; private keys and biometric data remain with the authenticator.

For Android APK sign-in, also apply `supabase/migrations/20261020150000_add_mobile_passkey_handoffs.sql`. The app opens the login page in an Android Custom Tab so Android's passkey provider can complete WebAuthn. A verified sign-in returns a random, single-use handoff token to the app, valid for 90 seconds; only its SHA-256 hash is stored. A PKCE-style verifier held by the app is required to exchange the token for its secure session cookie, protecting the handoff if another app intercepts the custom-scheme link. Android passkey registration remains available from a supported browser under **Settings → Account → Password & passkeys**.

## Relying-party domain

The RP ID defaults to `lktech.life` for `*.lktech.life` hosts, so credentials work across LKTECH subdomains. For another deployment hostname, the RP ID defaults to that hostname. Set `PASSKEY_RP_ID` only when the selected host is the RP ID itself or one of its subdomains. Production passkey ceremonies require HTTPS.

Apply the migration before deploying the passkey API. Until then, users can continue signing in with their existing methods.
