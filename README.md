# Hearthstone Hub

## Standalone frontend

The React, TypeScript, and Vite application lives in `frontend/`, directly inside this Git repository. Run the following commands from the directory returned by `git rev-parse --show-toplevel`.

```sh
cd frontend
npm install
npm run dev
```

Use Node.js 22.13 or later. For a reproducible installation from the existing npm lockfile, use `npm ci`.

The frontend defaults to its mock data provider and starts with the backend offline. Open the URL printed by Vite and try the fictional address **123 Example Street**. Dependencies and configuration are contained in `frontend/`.

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e
```

The browser tests require Chromium, which can be installed with `npx playwright install chromium`. Production output is written to `frontend/dist/`.

## Repository layout

```text
gdg-apartments/
├── frontend/          Standalone Hearthstone Hub Vite application
├── src/               Existing Next.js application and API routes
├── supabase/          Existing database migrations
├── scripts/           Existing backend and data utilities
├── aptsignal-auth/    Existing authentication project
├── prototype/         Existing prototype
├── docs/              Existing technical documentation
└── README.md
```

In this local checkout, `GDG/` is an outer wrapper repository. The Hearthstone Hub project root is `GDG/gdg-apartments/`. Its `frontend/` directory belongs to the project's Git history.

## Backend and authentication integration

For live data, configure these values in `frontend/.env.local` and start the existing backend separately.

```dotenv
VITE_DATA_PROVIDER=api
VITE_API_BASE_URL=/api
HEARTHSTONE_DEV_API_TARGET=http://localhost:3000
```

The frontend's Vite proxy forwards `/api` to the configured backend. The browser Supabase client handles OAuth, email links, and the PKCE callback at the frontend's `/auth/callback` route. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env.local` and configure the Google and GitHub providers in Supabase. Authentication also works with mock housing data.

For production, route `/api/*` to the backend and serve `/auth/callback` through the frontend history fallback. Configure Supabase's Site URL and redirect allowlist for the frontend's public origin. All `VITE_` variables are public client configuration.

Private saved-apartment requests send the current Supabase bearer token and omit cookies. The existing backend uses cookie authentication, so it needs JWT verification and owner authorization for these bearer requests before cloud saves can work with browser OAuth. Mock saves remain available with separate storage for anonymous visitors and each signed-in user.

See the [frontend README](frontend/README.md) for environment variables, deployment instructions, adapter contracts, and current limitations. The [API reference](docs/API.md) describes the existing backend endpoints.
