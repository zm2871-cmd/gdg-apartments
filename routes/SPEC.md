# Routing — Connect the frontend to the pipeline database

Branch: `routing` · Folder: `routes/` · Tickets: [`TICKETS.md`](TICKETS.md)

| | |
|---|---|
| **Status** | Draft v1 |
| **Last updated** | November 12, 2026 |
| **Sizing** | S = a day or two · M = a few days (same scale as the data pipeline plan) |
| **Total** | 8 tickets (5 S, 3 M), roughly 2–3 weeks for one developer |

---

## 1. Goal

When a user types an address in the frontend (`frontend/`), the suggestions, the building report and the comparison
must come from the pipeline's Supabase tables (`buildings`, `issues`, `source_fetches`). Today they come from live
NYC API calls made by `src/lib/nyc/*`.

## 2. What already exists

Most of the routing is already built. This project changes the **data source behind the routes**, not the routes.

| Layer | Where | State |
|---|---|---|
| Frontend HTTP client | `frontend/src/services/api.ts` (`ApiHousingDataProvider`) | Done. Calls `/api/address/autocomplete`, `/api/address/resolve`, `/api/buildings/:id` and `/api/compare`, and validates each response with zod. |
| Frontend mode switch | `frontend/src/services/runtime.ts`, `frontend/.env.example` | Done. Set `VITE_DATA_PROVIDER=api` and `VITE_API_BASE_URL=/api`. |
| Dev proxy, frontend to backend | `frontend/vite.config.ts` | Done. `HEARTHSTONE_DEV_API_TARGET=http://localhost:3000` forwards `/api` and `/auth/callback`. |
| API routes | `src/app/api/**/route.ts` (Next 16 route handlers) | Done. They use the **old** data layer. |
| Per-request checks | `src/lib/security.ts` (`guard`, `failure`, `json`) | Done. Rate limit, origin check on writes, error envelope `{ error: { code, message } }`, `no-store`. |
| Middleware | `src/proxy.ts` | Done. Next 16 renamed `middleware.ts` to `proxy.ts`. It only refreshes the Supabase session on account routes. |
| Pipeline DB client | `src/lib/db.ts` `pipeline()` | On `data-google-maps`, not on `main` yet. |
| Pipeline read/write functions | `data-pipeline/lib/` | On `data-google-maps`, not on `main` yet. |

### No new middleware

Next 16's docs (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`) say Proxy "is _not_ intended
for slow data fetching". Building lookups are public reads, so `src/proxy.ts` and its matcher stay as they are.
Request validation, rate limiting and error handling already sit in `guard()`/`failure()`, which every route calls.
The middle layer we actually need is one server-only module, `src/lib/pipeline.ts`, between the routes and the
pipeline database (ROUTE-03).

## 3. Target architecture

```
frontend/ (Vite, ApiHousingDataProvider)
   │  fetch /api/...   (dev: Vite proxy → :3000 · prod: same origin)
   ▼
src/app/api/**/route.ts        guard() → zod-parse input → call lib → json() / failure()
   │
   ├── address/autocomplete ─► pipeline.searchAddress()            (GeoSearch, no DB write)
   ├── address/resolve ──────► pipeline.resolveBuilding()          (upsert buildings row)
   └── buildings/:id, compare, trends, records, advisor
          └► src/lib/reports.ts getReport()
                └► pipeline.ingest()  (refetches stale sources only, 24 h freshness)
                └► pipeline.getBuildingIssues()  ─► toReport()  (maps to the existing Report contract)
   ▼
Pipeline Supabase project (buildings · issues · source_fetches · google_places)

App Supabase project (auth · saved_buildings · saved_comparisons · leases) — unchanged
```

## 4. Decisions

| # | Decision | Why |
|---|---|---|
| 1 | **Keep two Supabase projects.** Building data is read from the pipeline project through `pipeline()`. Users, saved items and leases stay in the app project. | `data-google-maps` already set this up (`PIPELINE_SUPABASE_URL`, `PIPELINE_SUPABASE_SECRET_KEY`). Merging the schemas means two conflicting `buildings` tables and destructive migrations, all to save one env var pair. |
| 2 | **The building ID is the BBL** (10 digits, `^[1-5]\d{9}$`). `demo-1..3` stay. | The pipeline keys everything by BBL. The old `nyc-<sha256>` IDs only exist to point at the old table. The frontend accepts any string up to 150 characters. |
| 3 | **Keep every HTTP contract the frontend already validates** (`identity`, `reportSchema`, `comparisonSchema` in `frontend/src/services/api.ts`). | No frontend changes are needed, and the zod schemas catch any mapping mistake. |
| 4 | **Convert in one place:** `toReport()` in `src/lib/pipeline.ts` maps pipeline rows to the existing `Report`. The routes don't change. | `getReport()` is the one function that nine routes and pages call. Swapping its internals updates all of them. |
| 5 | **Ingest on read.** `getReport()` calls `ingest()` first. It only refetches sources older than 24 h (`fresh_for_ms`). | A citywide preload is out of scope (pipeline plan §1). The first view of a building is slow (311 queries can take about 9 s), so routes that call `getReport` set `maxDuration`. |
| 6 | **Autocomplete never writes.** Only `resolve`, which runs once per selection, upserts a `buildings` row. | Autocomplete runs on every keystroke. |
| 7 | **Scoring is unchanged.** `score()` in `src/lib/scoring` runs on the mapped `Evidence[]`. | Changing scoring is a separate project. Google ratings must never be used in scoring (GMAPS-01). |
| 8 | **The app imports the pipeline's JS directly** (`data-pipeline/lib/*.js`). The code is not copied. | `tsconfig` has `allowJs: true`, and both packages use the same `zod` 4 and `supabase-js` 2. One copy of the cleaning rules. |

## 5. Field mapping (`toReport`)

Pipeline input: the `buildings` row plus `getBuildingIssues(bbl, db, { bin })`.

**Identity**

| Report field | From |
|---|---|
| `id`, `bbl` | `buildings.bbl` |
| `address`, `borough`, `bin` | `buildings.address`, `.borough`, `.bin` |
| `lat`, `lng` | `buildings.geom` (decode with the pipeline's EWKB helper) |
| `lotUnits` | `buildings.units_res` |
| `confidence` | `building.matched === true` → `building` · otherwise → `tax_lot` |

**Evidence**, one per row in `issues`, plus one per collapsed `noise` group

| Field | Rule |
|---|---|
| `id` | `` `${source}:${source_id}` `` |
| `category` | `repairs` → `maintenance`. The other categories keep their names. |
| `kind` | `hpd_violation` → `violation` · `hpd_complaint`, `311` → `complaint` · `rodent` → `inspection` · `bedbug` → `filing` |
| `scope` | Rows in `building.issues` → `building` · other rows on the lot → `tax_lot` · `noise` → `nearby` |
| `severity` | 1 → 1 · 2 → 3 · 3 → 6 |
| `date`, `status`, `description` | `observed_at`, `status`, `description` |
| `url` | Dataset page `https://data.cityofnewyork.us/d/<dataset_id>` (from `sources.js`) |
| `positive` | `true` (the pipeline stores only positive findings) |
| `lat`, `lng` | Row `geom`, if present |

**Coverage**, one per `sources[]` entry: `ok` → `ok` · `stale` → `stale` · `failed` → `error` · `missing` → `unmatched`.
`checkedAt` = `lastSuccessAt`. `count` = the number of mapped records from that source.

## 6. Out of scope

- Merging the two Supabase projects, or dropping the old evidence tables in the app project. That is a later cleanup.
- New endpoints or frontend changes beyond turning on API mode.
- Changes to scoring or grades.
- Deployment routing (same-origin hosting of `frontend/` and `/api`). `frontend/README.md` already describes it.
- Google/Yelp in the Vite frontend. The reviews page stays in the Next app.

## 7. Risks and open questions

1. **`data-google-maps` must merge first** (ROUTE-01). Until it does, `main` has neither the pipeline nor `pipeline()`.
2. **Saved buildings with old `nyc-` IDs stop resolving.** `saved_buildings.building_id` has a foreign key to the app's old
   `buildings.id`, so ROUTE-02 must drop that key. Existing saved rows are test data. Confirm with the team before running it.
3. **First-view latency.** Measure it in ROUTE-06. If it's too slow, the fallback is to return what's stored, mark
   coverage `stale`, and ingest in the background with `after()` from `next/server`.
4. **Hosting timeouts.** Vercel limits `maxDuration` by plan. `/api/compare` can ingest three buildings.
