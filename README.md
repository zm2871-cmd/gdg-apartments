# Hearthstone Hub

NYC apartment research app. The `data-pipeline` branch contains data fetchers and
database migrations; this branch adds a Next.js sign-in demo on top of them.

## Run the sign-in demo

1. Run `npm install` and copy `.env.example` to `.env.local`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   using the **same Supabase project** as the data pipeline. These are public
   project values; never put `SUPABASE_SECRET_KEY` in a `NEXT_PUBLIC_` variable.
3. In Supabase Auth settings, allow `http://localhost:3000/auth/callback` as a
   redirect URL (and the matching preview/production callback URLs when deployed).
4. For email sign-in, set the **Magic Link** and **Confirm signup** email templates'
   link target to:

   ```text
   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email
   ```

   This lets the server callback verify the token and save the session in cookies.
   Google sign-in uses the OAuth code callback instead; enable the Google provider
   in Supabase if the team wants that option.
5. Run `npm run dev`, visit `http://localhost:3000/login`, and sign in. The
   `/account` page requires a verified session and includes sign-out.

Without the two public project values, the pages still run and show a setup
notice. The app does not yet include building reports or saved apartments.
