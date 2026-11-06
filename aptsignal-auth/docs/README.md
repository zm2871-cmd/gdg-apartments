> **Current override: AI is hard-disabled at the owner’s request.** OpenAI call code and SDK have been removed. API keys, environment flags and request consent cannot enable AI. The advisor is deterministic only; older descriptions of optional AI below describe the previous implementation, not current behavior. Re-enabling requires an explicitly authorized code change. Hosting/database/map charges are separate from AI and are not controlled by this lock.

# AptSignal

NYC apartment research built with Next.js App Router, strict TypeScript, React, Tailwind, Supabase and PostGIS. See `IMPLEMENTATION_STATUS.md` for the exact launch blockers; this is runnable application code, but not a certified production deployment.

## Run locally

Node 22 LTS (22.13+) or newer compatible Node; npm. This session used Node 25.4.0.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No credentials are needed for synthetic examples or public NYC data calls. A real request never falls back to synthetic records. Without Supabase, real identities and cached reports exist only in the current server process; provision Supabase for durable/shareable reports and serverless deployment.

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm start
npm run check:sources
npm run check:building
npm run seed:demo
```

`build` uses the supported Next.js Webpack compiler because this execution environment blocked Turbopack’s CSS worker port. The lockfile pins the installed dependency tree. `seed:demo` verifies code-backed fixtures; it never inserts fake official records.

## Provision Supabase

1. Create a project at https://supabase.com/dashboard. From project API settings, configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` and Vercel. Never expose the service key in a public variable.
2. Install/use the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Run `npx supabase login`, `npx supabase link --project-ref YOUR_PROJECT_REF`, then `npm run db:migrate`. The migration creates PostGIS in `extensions`, tables, RLS, quota RPC, indexes and the private `leases` bucket.
3. Set Auth Site URL to the actual deployment origin. Allow exactly `http://localhost:3000/auth/callback` and `https://YOUR_DOMAIN/auth/callback` as redirect URLs. Configure production SMTP; verify email delivery. Server routes use verified `getUser()` identity and cookie-based PKCE; `src/proxy.ts` refreshes sessions on private routes.
4. Run `npm run test:rls` against an **isolated test project** with environment variables exported. It creates two temporary auth users, checks cross-user isolation and unauthorized writes, then deletes the test users. It has not been executed against a provisioned project in this session.
5. Use Supabase CLI generated database types after applying migrations: `npx supabase gen types typescript --linked > src/lib/database.types.ts`. Current application boundaries use hand-authored Zod domain schemas; generated DB types are not yet wired into the clients.

Standalone scripts use exported environment variables, not Next.js `.env.local` loading. Do not paste secrets into logs or commit them.

## Credentials / integrations

| Variable | Requirement |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Real origin for auth redirects, metadata and links |
| Supabase URL / anon / service-role keys | Accounts, private leases, durable reports, scheduled jobs, atomic AI quota |
| `NYC_SOCRATA_APP_TOKEN` | Optional [Socrata application token](https://dev.socrata.com/docs/app-tokens.html); improves quota attribution |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional licensed MapLibre-compatible provider style URL. Restrict provider key to your domains and preserve attribution. No default production OSM tile usage. |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `AI_ENABLED=true` | Optional apartment advisor. Choose an available Structured Outputs-compatible model in your project. See [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs). |
| `CRON_SECRET` | Long random secret used by Vercel cron and internal job handlers |
| `DEMO_MODE` | Defaults enabled unless explicitly `false`; only `demo-*` routes use invented records |
| `MAX_AI_REQUESTS_PER_USER_PER_DAY` | Maximum five server-enforced quota reservations per user/day |

`LEASE_AI_ENABLED` and `SENTRY_DSN` are reserved placeholders, not implemented integrations. Lease processing is deterministic and does not call an AI provider. `DATABASE_URL` is reserved for DB tooling, not the HTTP runtime.

## Vercel deployment

Import this repository into Vercel; select Next.js, Node 22, install `npm ci`, build `npm run build`. Configure environment variables separately for Preview and Production. Apply SQL migrations before enabling private features. Set `NEXT_PUBLIC_SITE_URL` to the corresponding deployment origin and register auth redirect URLs. Deploy with Vercel UI or `npx vercel --prod` after account/project setup. No deployment was performed in this session.

`vercel.json` schedules targeted ingestion at 07:00 UTC and lease cleanup at 08:00 UTC. Vercel sends `Authorization: Bearer CRON_SECRET`. Jobs reject absent/incorrect credentials. Current ingestion refreshes one least-recently-updated building per run; increase scheduling/queue capacity before broad usage. Cleanup removes at most 50 expired documents per run; alert on backlog and failures. On Vercel, request-body limits can be lower than the application’s 10 MB PDF cap (commonly 4.5 MB); direct-to-private-storage upload initiation is a required follow-up for the full advertised cap on that host. Limit uploads accordingly before launch.

Use HTTPS, provider domain restrictions, Vercel firewall rules and monitoring. The current generic request limiter is process-local, not a distributed abuse prevention system. Paid advisor requests additionally use an atomic database quota.

## Structure

```text
src/app/                 Pages, auth callback, API routes and metadata
src/components/          Search, reports, comparison, account and lease UI
src/lib/nyc/             Allowlisted official fetch, schemas, identity and adapters
src/lib/scoring/         Pure deterministic burden/cohort/weight calculations
src/lib/legal/           Versioned official-guidance topic rules
src/lib/                 PDF extraction, auth/DB, reports, AI and security
supabase/migrations/     PostGIS, normalized columns, RLS and quota function
scripts/                 Source smoke tests, demo validation, ingestion, RLS test
tests/                   Unit and Playwright browser tests
reference/               User-provided specification and visual reference
```

Read `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/SCORING.md`, `docs/DATA_SOURCES.md`, and `docs/LEASE_SAFETY.md` before extending the app. All live A–F grades remain intentionally disabled until a validated citywide reference cohort is implemented.
