# Reuse in the original AptSignal application

This project intentionally does not modify the main website. It is a separate Next.js package, not an npm workspace or nested Git repo. Copying its folder into a new repo requires no parent assets, imports, aliases, environment files or custom server.

## Shared users, not automatic shared cookies

Configure the **same Supabase project URL** for both apps. The main app currently names its browser-safe key `NEXT_PUBLIC_SUPABASE_ANON_KEY`; this app uses `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Both can access the same Auth provider/users. This standalone app creates no competing identities or profile table. Existing passwordless users can set a password using the recovery flow.

Cookies are not automatically shared between distinct domains. Users can use the same email/password on both origins, but may need to sign in on each. Do not pass access or refresh tokens in query parameters to transfer sessions. Do not add a broad cookie Domain attribute as a shortcut. Supabase email templates and redirect allowlists must include the intended origin for each app.

## Integrating the source into one application later

1. Copy `src/components/auth`, `src/components/ui`, `src/lib/auth` and the Supabase clients into the destination app; adapt relative imports to its folder structure.
2. Add only required routes and merge design tokens with the existing stylesheet instead of replacing it.
3. Replace or merge the existing session-refresh proxy with **one** handler. Never run two refresh systems or cookie writers concurrently.
4. Normalize key variable naming deliberately. Do not copy private service-role keys into these clients.
5. Keep the destination app’s existing public-record and private-data RLS policies. Auth metadata is display data only and cannot grant application permissions.
6. Extend `safeDestination` with an explicit internal allowlist for saved reports/account pages. Update both protected route matching and server authorization for every protected page/action.
7. Update email URLs and legal acknowledgment version. Preserve the PKCE recovery callback and recent verified recovery claim check.
8. Run auth tests in the destination app and the original app’s report/PDF regression suite before replacing its login UI.

## Profiles

No `profiles` table is needed for this demonstration. Supabase owns the identity and email. `full_name` is user-editable metadata, escaped on display. If you later need avatar URLs or more profile data, create a table referencing `auth.users(id)` with owner-only SELECT/INSERT/UPDATE RLS and an audited creation trigger or idempotent insert; do not authorize by `user_metadata`.

## Repository nesting and parent tools

The original root config uses recursive TypeScript/ESLint file discovery. Run each project’s tools **from its own folder**. Parent toolchains may scan a nested project’s generated `.next` files and its tests. To avoid modifying the original app’s configuration, this task validates the standalone build from an independent temporary copy and keeps generated build/test artifacts outside the source folder at handoff. After copying to a separate repo, this nesting issue disappears. If you choose to keep building the nested project permanently, separately authorize adding `aptsignal-auth/**` to the parent’s tool exclusions.
