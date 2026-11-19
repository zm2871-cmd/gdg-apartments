# Hearthstone Hub

Hearthstone Hub helps NYC renters research building records and compare apartments. The approved React interface is in `frontend/`. The existing Next.js application at the repository root supplies the HTTP API, data adapters, scoring, and private account operations.

The applications have separate npm dependencies, lockfiles, configuration, and environment files. The frontend starts with mock data while the backend is offline.

## Repository layout

```text
gdg-apartments/
├── frontend/              Approved React, TypeScript, and Vite application
├── src/                   Existing Next.js app, HTTP API, and server logic
├── scripts/               Existing ingestion, source checks, and database checks
├── supabase/migrations/   Existing database schema and access policies
├── tests/                 Existing Next.js and backend tests
├── docs/
│   └── architecture.md    Ownership, data flow, and backend migration plan
├── reference/             Original design and project references
├── public/                Existing Next.js public-assets directory
├── package.json           Existing Next.js/backend commands and dependencies
└── README.md
```

The backend remains at the root during this cleanup because teammates are actively changing these files and their deployment configuration. The coordinated migration described in [the architecture guide](docs/architecture.md) moves that existing application into a sibling `backend/` package after those changes are reconciled.

## Frontend development

Use Node.js 22.13 or later and npm. From the repository root, run the following commands.

```sh
cd frontend
npm ci
npm run dev
```

`npm install` also works for local dependency installation. Open the URL printed by Vite, normally `http://localhost:5173`. Try the fictional address **123 Example Street**. Use the existing `VITE_DATA_PROVIDER=mock` default for development without the backend.

To customize the configuration, copy `frontend/.env.example` to `frontend/.env.local` and edit the local file. Public Supabase settings enable authentication independently of the housing data provider.

```dotenv
VITE_DATA_PROVIDER=mock
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-public-publishable-key
```

The [frontend README](frontend/README.md) covers OAuth provider setup, callback URLs, account sessions, mock saves, and production hosting.

## Existing backend development

Run these commands from the repository root in a separate terminal.

```sh
npm ci
cp .env.example .env.local
npm run dev -- --port 3000
```

Edit the root `.env.local` with the backend's own configuration. Demo reports such as `http://localhost:3000/building/demo-1` work without database credentials when demo mode is enabled. Live address lookup requires the official NYC services. Durable reports and private resources require Supabase.

| Backend setting | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing Supabase project and public client key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side persistence and privileged operations |
| `NEXT_PUBLIC_SITE_URL` | Existing Next.js origin and cookie-auth redirect configuration |
| `NYC_SOCRATA_APP_TOKEN` | Optional server-side NYC Open Data application token |
| `CRON_SECRET` | Authenticates scheduled ingestion and cleanup |
| `GEMINI_API_KEY` | Optional server-side Gemini building advice |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional public map style for the existing Next.js UI |
| `DEMO_MODE` | Set to `false` to disable the existing synthetic reports |
| `MAX_LEASE_PDF_MB`, `MAX_LEASE_PDF_PAGES` | Existing lease-upload limits |

Root and frontend environment files are loaded by their respective applications. Values prefixed with `VITE_` or `NEXT_PUBLIC_` are public. Keep provider secrets and service-role keys in server or provider configuration.

`supabase/migrations/` belongs to the existing backend schema. Database deployment, `npm run db:migrate`, and `npm run test:rls` need the backend maintainer's configured project. The RLS script creates and removes temporary users and is intended for an isolated test project.

## Connect the applications

For local API development, use these settings in `frontend/.env.local`, start the backend on port 3000, and restart Vite.

```dotenv
VITE_DATA_PROVIDER=api
VITE_API_BASE_URL=/api
HEARTHSTONE_DEV_API_TARGET=http://localhost:3000
```

The Vite proxy forwards `/api` to the backend. Frontend response schemas and adapters in `frontend/src/services/` map API responses into frontend models. The [API reference](docs/API.md) describes the existing endpoints.

Google, GitHub, and email-link authentication use the frontend's centralized Supabase client. The frontend owns `/login`, `/signup`, and `/auth/callback`. Private frontend requests carry the current Supabase bearer token and omit cookies. The existing backend uses cookie authentication, so cloud saves need backend JWT verification and authorization before they work with this OAuth flow. Anonymous and user-specific mock saves remain available.

For independent deployment, build `frontend/` and serve its `dist/` directory with a history fallback to `index.html`. Route `/api/*` to the backend and keep the frontend callback with the frontend. Alternatively, a separate API origin requires backend CORS configuration. The existing backend uses the root Next.js build, `vercel.json`, and scheduled API routes.

Upstream `main` has added an embedded frontend build and Next.js rewrites since this branch split. Reconcile that deployment work with these OAuth routes before changing hosting or moving the backend.

## Build and verify

Run each application's commands from its package directory. From the repository root, the following equivalents are available.

| Check | Frontend | Existing Next.js/backend |
| --- | --- | --- |
| TypeScript | `npm --prefix frontend run typecheck` | `npm run typecheck` |
| Unit tests | `npm --prefix frontend test` | `npm test` |
| Production build | `npm --prefix frontend run build` | `npm run build` |
| Browser tests | `npm --prefix frontend run test:e2e` | `npm run test:e2e` |
| Existing lint rules | See the frontend's own configured checks above | `npm run lint` |

Install Chromium with `npm exec --prefix frontend -- playwright install chromium` for frontend browser tests. The frontend suite starts isolated servers with blank or fake Supabase configuration and intercepts Auth responses. It exercises mock mode and OAuth lifecycle behavior. Live provider login, database policies, NYC availability, and production deployment require separate configured verification.

## Where to make changes

- Change approved UI, responsive styling, browser authentication, and API adapters in `frontend/`.
- Coordinate backend changes in `src/app/api/`, `src/lib/`, `src/proxy.ts`, `scripts/`, and `supabase/` with their maintainers. The existing Next.js UI still shares these modules.
- Use `docs/` for current integration and ownership information. Preserve `reference/` as source material.

The root TypeScript and ESLint checks exclude the independent frontend package. Run its checks separately. Generated dependencies, builds, local environments, and test output are ignored by Git.
