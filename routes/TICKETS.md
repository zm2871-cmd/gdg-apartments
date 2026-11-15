# Routing — Tickets

Branch: `routing` · Folder: `routes/` · Spec: [`SPEC.md`](SPEC.md)

Order: ROUTE-01 → 02 → 03 → 04 → (05, 06 in parallel) → 07 → 08.

---

## ROUTE-01 · Bring the pipeline into `routing` · S

**Why:** `main` doesn't have `data-pipeline/` or `pipeline()` in `src/lib/db.ts` yet. Both live on `data-google-maps`.

- [x] Merge the `data-google-maps` PR into `main` (preferred), then merge `main` into `routing`.
      If the PR is blocked, merge `origin/data-google-maps` into `routing` directly.
      _Done via the fallback: PR #8 was unreviewed, so `origin/data-google-maps` was merged into `routing`._
- [x] Add `PIPELINE_SUPABASE_URL` and `PIPELINE_SUPABASE_SECRET_KEY` to the root `.env.example`, with a comment that they
      are server-only.
- [x] `npm run build` and `npm test` pass at the root, and `npm test` passes in `data-pipeline/`.
      _Needs Node 22 (`.nvmrc`); on Node 20 the PDF and DB tests fail. Also excluded `frontend/` from the root `tsconfig.json`._

**Done when:** `routing` builds with the pipeline code in it and both env vars are documented.

---

## ROUTE-02 · Building IDs become BBLs · S

**Why:** The app checks IDs against `^nyc-[a-f0-9]{24}$` in several places. The pipeline uses BBLs (spec decision 2).

- [x] Add one exported `buildingId` zod schema, `/^([1-5]\d{9}|demo-[123])$/`, in `src/lib/domain.ts`. Use it in every place
      that currently hard-codes the `nyc-` regex. On `main` that is `api/buildings/[id]/route.ts` and `api/saved/route.ts`,
      and after ROUTE-01 also `building/[id]/reviews/page.tsx`. Re-run `grep -rn "nyc-" src` after the merge.
      `.../records`, `.../trends` and `compareSchema` accept any string, so tighten them to the same schema.
      _Also applied to `api/ai/advice` and `building/[id]/page.tsx`. `api/saved` additionally rejects `demo-*`._
- [ ] Add an app-project migration that drops the foreign key `saved_buildings.building_id → buildings.id` and adds
      `check (building_id ~ '^[1-5][0-9]{9}$')`. ⚠️ Confirm with the team first (spec risk 2). _Not started, on hold for team sign-off. Note: `GET /api/saved` joins `buildings(canonical_address)` through this key, so dropping it breaks that select._
- [x] Unit test: the schema accepts `3012340056` and `demo-1`, and rejects `nyc-…`, `0000000000` and `30123400561`.

**Done when:** a BBL passes validation on every route, and saving a BBL works.

---

## ROUTE-03 · `src/lib/pipeline.ts`: server-only bridge and `toReport` · M

**Why:** One typed place where the TS app calls the JS pipeline and converts its output (spec decisions 4 and 8).

- [x] `import 'server-only'`. Re-export `searchAddress`, `resolveBuilding`, `ingest` and `getBuildingIssues` from
      `data-pipeline/lib/*.js`. Use the existing `pipeline()` client from `src/lib/db.ts`. Don't create a new one.
- [x] Confirm that Next/Turbopack bundles the `../data-pipeline/lib` imports in a route handler. If it doesn't, add the
      folder to `transpilePackages`/`outputFileTracingIncludes` in `next.config.ts`. Read the Next 16 docs in
      `node_modules/next/dist/docs/` first.
      _Not needed: `next build --webpack` compiles a route importing all four functions with no config change._
- [x] `toReport(buildingRow, issuesResult): Report`. A pure function that follows the mapping table in spec §5.
      `toIdentity(buildingRow | searchMatch): Identity` for the address routes.
- [x] Vitest: build a `getBuildingIssues`-shaped fixture with one row per source plus one noise group. Assert that
      `identitySchema` parses the identity, and that `score()` runs on the records without throwing. Cover each
      category, kind, scope, severity and coverage-status mapping.
      _Undated pipeline rows are dropped (the frontend's `date` schema rejects them); see the `shortcut:` comment._

**Done when:** the tests pass, and importing the module from a route compiles in `next build`.

---

## ROUTE-04 · `GET /api/address/autocomplete` from the pipeline · S

- [x] In `src/app/api/address/autocomplete/route.ts`, replace `geocode(q)` with `searchAddress(q)`, then `toIdentity`.
      Keep `guard()`, the 3–120 character zod check and the `{ candidates }` response.
- [x] No database writes here (spec decision 6).
- [x] Test the route handler with `searchAddress` mocked: the 400 for `q=ab`, and that the response shape matches the
      frontend's `identity` schema.
      _Also smoke-tested `next dev` against live GeoSearch: `q=350 5th ave` → BBL IDs (`1008350041`, …). Frontend check is ROUTE-07._

**Done when:** typing in the frontend's search box (API mode) shows GeoSearch suggestions whose IDs are BBLs.

---

## ROUTE-05 · `GET /api/address/resolve` upserts the building · S

- [x] Replace `geocode(q, true)` + `reconcile` + `remember` with: `searchAddress(q)`, then find the match whose `label`
      exactly equals `q` (case-insensitive, same as today). If there's no match, keep the existing 404 `NO_EXACT_MATCH`.
      Then call `resolveBuilding(match, pipeline())` and return `toIdentity(row)`.
- [x] If `pipeline()` returns `null`, throw `PERSISTENCE_UNAVAILABLE`, which `failure()` turns into a 503.
- [x] Test: exact match → 200 with a BBL ID · near match → 404 · no DB → 503.
      _Live check: `350 5 AVENUE, New York, NY, USA` → 200, BBL `1008350041` upserted (1.7 s, mostly PLUTO); `350 5th ave` → 404._

**Done when:** selecting a suggestion creates or updates a row in the pipeline `buildings` table.

---

## ROUTE-06 · `getReport()` reads the pipeline · M

**Why:** `getReport()` is called by `/api/buildings/:id`, `/records`, `/trends`, `/compare`, `/advisor`, `/ai/advice`,
`/internal/ingest` and `building/[id]/page.tsx`. Changing it changes all of them (spec decision 4).

- [x] Rewrite `getReport(id)` in `src/lib/reports.ts`. Demo IDs work as before. For a BBL: read the `buildings` row
      (none → `null` → 404), call `ingest(buildingRef, db)`, then `getBuildingIssues(bbl, db, { bin })`, then
      `toReport(...)`.
- [x] Rewrite `getIdentity(id)` so it reads the pipeline `buildings` row through `toIdentity`.
- [x] Remove the in-memory identity map, the 15-minute report cache and the writes to the app's `buildings.report`.
      `source_fetches` handles freshness now.
- [x] Add `export const maxDuration = 60` to the route segments that call `getReport` and don't set it yet:
      `api/buildings/[id]`, `.../records`, `.../trends`, `api/compare`, `api/advisor`. (`internal/ingest` and
      `ai/advice` already set it.)
- [x] Measure cold and warm response times of `/api/buildings/<bbl>` for 3 real addresses and write them in this ticket.
      If cold takes more than 15 s, open a follow-up for the `after()` fallback (spec risk 3).
      _Measured Nov 15, 2026 on `next start` (local machine, Node 22):_

      | Address | BBL | Cold | Warm | Records |
      |---|---|---|---|---|
      | 1 West 72 Street, Manhattan | 1011250025 | 7.93 s | 0.29 s | 40 |
      | 100 Hicks Street, Brooklyn | 3002250019 | 3.73 s | 0.29 s | 128 |
      | 2 Fifth Avenue, Whitestone | 4044390014 | 6.04 s | 0.28 s | 7 |
      | 281 Marcus Garvey Blvd, Brooklyn | 3016290001 | 3.69 s | 0.23 s | 670 |

      _All under 15 s, so no `after()` follow-up. Warm calls skip ingest (all sources fresh)._
- [x] Test with `ingest`/`getBuildingIssues` mocked: unknown BBL → `null`, known BBL → a report that passes the
      frontend's `reportSchema`.

**Done when:** `/api/buildings/<bbl>` returns real pipeline records, and a second call within 24 h makes no Socrata
requests.

---

## ROUTE-07 · Turn on API mode in the frontend and smoke-test it · S

- [x] Start Next (`npm run dev`, port 3000) and the frontend with `VITE_DATA_PROVIDER=api`, `VITE_API_BASE_URL=/api` and
      `HEARTHSTONE_DEV_API_TARGET=http://localhost:3000`.
- [ ] Manually check the flow: search, select, report, compare 2 buildings, save (signed in).
      _Done: search → select → report (Playwright, real data) and compare 2 BBLs (200, both reports; every category `missing` because there is no scoring baseline yet, unchanged behavior). **Not done:** save. It needs a signed-in session and fails until the ROUTE-02 migration drops the old foreign key._
- [x] Add one Playwright spec in `frontend/tests/` that runs only when `E2E_API=1` and covers search → report with a real
      address. It is skipped in CI, the same way the pipeline's DB tests are skipped without credentials.
- [x] Add the local setup steps to the "Connect the existing backend" section of `frontend/README.md`.

**Done when:** a teammate can follow the README and see a real building report in the Vite frontend.

---

## ROUTE-08 · Delete the old data layer · M

**Why:** After ROUTE-06, nothing should call the live-API code. Leaving it there invites drift.

- [x] Confirm that nothing imports them (`grep -rn "nyc/geocode\|nyc/adapters\|nyc/client" src`), then delete
      `src/lib/nyc/geocode.ts`, `src/lib/nyc/adapters.ts` and `src/lib/nyc/client.ts`, along with their tests.
      _Also moved `/data-sources` to the pipeline's source list, and deleted `scripts/check-sources.ts` and `scripts/smoke-building.ts` and their npm scripts._
- [x] `api/internal/ingest`: delete its logic or reduce it to calling `ingest()` for buildings whose sources are stale. It
      currently writes to the old `records`, `ingestion_runs` and `building_score_snapshots` tables, and `vercel.json`
      runs it as a daily cron at 07:00 UTC. Keep the cron working or remove the entry.
      _Deleted the route, its `vercel.json` cron entry and `scripts/ingest.ts` (`ingest:sample`). Ingest on read keeps data fresh. The old tables in the app project are left for the later cleanup (spec §6)._
- [x] Remove the `nyc-` ID branch from `src/lib/demo.ts` and its fixtures, if present. _None in `demo.ts`; updated the `nyc-` fixture in `tests/e2e/app.spec.ts`._
- [x] `npm run build`, `npm test` and `npm run lint` pass.

**Done when:** `src/` no longer calls Socrata or GeoSearch directly. Only `data-pipeline/lib` does.
