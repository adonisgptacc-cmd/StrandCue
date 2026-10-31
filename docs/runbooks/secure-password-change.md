# Secure password change

Local source of truth: `supabase/config.toml` sets `secure_password_change = true`
under `[auth.email]`. With this on, Supabase rejects password updates from stale
sessions with error code `reauthentication_needed`, and the mobile recovery screen
keeps the typed password while directing the user to sign in again or request a
fresh recovery link.

## Pending manual action (hosted dashboard — human with dashboard access only)

`supabase/config.toml` is the local source of truth; it does not change hosted
settings. A human with dashboard access must confirm the hosted project matches:

1. Open the Supabase dashboard for the target project.
2. Go to Authentication → Providers → Email (email provider settings).
3. Confirm the **Secure password change** toggle is ON.
4. If it is OFF, turn it ON. Never share or commit dashboard credentials.

Until a human confirms the hosted toggle, finding AU-002 stays Likely: the code
handles the rejection, but stale sessions are only actually forced to
reauthenticate once the hosted setting is on. Record who verified it and when.
