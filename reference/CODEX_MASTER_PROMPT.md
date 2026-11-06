# APTSIGNAL — MASTER BUILD PROMPT FOR CODEX

> Paste this entire file into Codex, or place it in the repository and tell Codex to implement it. This is an implementation specification, not a request for a mockup. Work in the current repository and create the actual runnable application.

## 0. Agent operating instructions

You are acting as a senior full-stack engineer, product designer, geospatial data engineer, QA engineer, and security-minded technical lead. Build **AptSignal**, a functional NYC-first apartment due-diligence platform. The user is building a real product, not a school-project demo and not an AI-generated landing page. Deliver real code, migrations, unit tests, browser tests, API integrations, documentation, and deployment configuration.

**Execution rules**

1. Begin by inspecting the repository and the available tooling. If it is empty, initialize the app. Check actual dependency versions and authoritative documentation at implementation time; choose stable, compatible releases rather than assuming a particular version number.
2. Make decisions autonomously for ordinary implementation details. Do not stop to ask routine design questions. Implement vertically complete paths, not pages of disconnected placeholder controls.
3. First create `PLAN.md` with an ordered checklist and `DECISIONS.md` for meaningful tradeoffs. Keep both updated as you build. Deliver actual code, not only a plan.
4. Where a secret or paid service is needed, add a clearly named environment variable and a **working local development fallback**. Never fabricate live municipal records, AI results, lease legal judgments, or completed searches. The development fallback MUST visibly state `DEMO / SYNTHETIC DATA`.
5. Never commit secrets, unrestricted service-role keys, uploaded leases, user data, or raw sensitive PDF text to Git.
6. Run installation, TypeScript checks, ESLint, unit tests, Playwright tests, and production build. Fix problems; do not claim successful execution unless a command actually succeeded.
7. Do not hide major blockers. End with a concise `IMPLEMENTATION_STATUS.md` describing what is working live, what only works with credentials, what has demo behavior, and what remains blocked, plus exact commands for local development and deployment.
8. Respect upstream terms, API quotas, licensing, map tile attribution, user privacy, and source attribution.
9. Build responsive, accessible, fast, secure production-oriented code. No lorem ipsum, dead buttons, fictitious data posing as real, or unimplemented nav items.
10. Preserve domain boundaries so that NYC can later be joined by New Jersey without rebuilding the app.

## 1. Product definition

**Working name:** AptSignal (treat name as provisional; do not claim trademark/domain availability).

**Tagline:** `Know the building before you sign.`

**Core promise:** A renter enters an NYC residential address and sees available public records about pests, bedbugs, heating, maintenance, and nearby noise. The system presents transparent, appropriately qualified A–F risk indicators where supported, a block-level map, a timeline of records, historical changes, comparison of up to three buildings, landlord questions, AI-assisted decision summaries, and a private lease red-flag reader.

**Primary users:** New York City renters, students, people relocating to NYC, and people comparing 2–3 candidate apartments. **MVP geography:** NYC five boroughs. **Future:** New Jersey by adding jurisdiction-specific adapters and rules; do not pretend NYC laws/data apply in NJ.

**What makes the product distinct:** Source-linked and explainable risk indicators, comparisons tailored to the renter's own priorities, honest data coverage/confidence, and optional private lease review. Existing products already provide tenant reviews and violation records. Avoid asserting that these features are unprecedented.

**Definition of success:** A new user can enter an actual NYC address, select a valid matched address, see REAL source-linked records when available, understand limitations, compare it to another address, and return to the report. If external access fails, the user sees a truthful partial-data state instead of invented grades.

### In-scope capabilities

- Premium marketing homepage and fully accessible search experience.
- NYC address autocomplete and precise resolution.
- Building identity reconciliation (HPD BuildingID, BIN, BBL, address aliases).
- NYC public record ingestion: HPD violations; HPD bedbug filings; DOHMH rodent inspections; 311 requests; supporting building registry / PLUTO identifiers.
- Building overview, category grades where evidentially justified, evidence explorer, dates, charts, trends, map.
- Two- and three-building comparisons; weighted renter preferences.
- Personalized grounded AI apartment advisor with deterministic fallback.
- Downloadable / printable landlord question checklist.
- User login and private saved buildings/comparisons.
- Private lease-PDF analysis with source-linked, carefully qualified findings.
- Methodology, official data sources, about/FAQ, privacy, terms/disclaimer pages.
- Local demo setup with synthetic fixtures; automated tests; Vercel deployment config.

### Non-goals for first implementation

- Listings marketplace, payments/subscriptions, community reviews, actual rental prices, automated landlord outreach, legal advice, guarantees of safety, tenancy status determinations, NYC-wide city ranking without a validated city-wide baseline, production NJ coverage, or scraping openigloo.
- Do not show false real-time data, fake reviews, fake building photos, fake apartment inventory, fake partner logos, or invented AI testimonials.

## 2. Concrete technology stack

- **App:** Next.js App Router + React + TypeScript (strict mode), Node.js LTS, npm or pnpm (choose one consistently).
- **Design:** Tailwind CSS; shadcn/ui + Radix primitives; lucide-react icons; Motion for very light interactions; CSS variables for design tokens.
- **Validation:** Zod at all trust boundaries; shared domain types.
- **DB + auth + private files:** Supabase PostgreSQL + PostGIS (`extensions` schema), Supabase Auth, Supabase Storage private bucket, SQL migrations, generated TypeScript database types, RLS for all user-owned tables.
- **API:** Next.js Route Handlers and server modules; avoid exposing secrets client-side. Use appropriate server components and a small set of client components.
- **Maps:** MapLibre GL JS with provider-supplied map style URL and attribution; dynamically import map on client. Offer map-free view when tiles are unavailable. Do not use public OpenStreetMap tile servers for uncontrolled production traffic.
- **Data ingestion:** Node.js/TypeScript fetch-based adapters, SoQL/SODA APIs, cursor/checkpoint based incremental loads, scheduled orchestration, idempotent upserts, retry/backoff. Vercel Cron can trigger short batches; do not run multi-million-row imports in request handlers.
- **AI:** OpenAI official TypeScript SDK and server-only Responses API with supported Structured Outputs; configurable supported model via env; Zod validation of model outputs; deterministic offline fallback when key is absent; strict spend/rate caps.
- **PDF:** `pdfjs-dist` for text extraction/viewing if compatible in target runtime, or another well-maintained compatible parser with documented reason; text-based PDFs first. Scanned documents must be clearly marked unsupported or processed only by a separately configured OCR provider.
- **Tests:** Vitest + Testing Library where useful; Playwright end-to-end; MSW or explicit HTTP mocks; ESLint; GitHub Actions CI.
- **Hosting / errors:** Vercel, Sentry optional via env, structured server logs excluding personal document text.

Do not add microservices, Redis, Kafka, Python, vector databases, paid geocoding, a heavyweight ORM, Redux, or a separate Express API without a demonstrated need.

## 3. Visual direction and design system

A sophisticated, editorial, data-forward product. See optional `homepage_visual_reference.png` for the general layout and mood, NOT as a source of real data or final copy. Do not copy its fake building scores or timestamps as real.

**Design values:** Beautiful but credible; restrained, spacious, custom-feeling, not a generic AI dashboard or glossy template. Use modern typography, clear hierarchy, high-contrast text, elegant cards, generous whitespace, consistent 8px spacing, delicate borders and restrained shadows. Prefer real UI diagrams/data to random 3D illustrations, gradients, glassmorphism, neon glowing buttons, excessive pill badges, and stock-photo filler.

**Suggested fonts:** Newsreader or other high-quality editorial serif for headline-level display; Inter or Geist for UI/body. Load via Next.js font optimization or dependable fallbacks. Avoid too many weights.

**CSS color tokens** (approximate from design reference):

```css
:root {
  --color-primary: #0D5449;
  --color-primary-hover: #083D35;
  --color-heading: #0B1B2B;
  --color-background: #F8F7F3;
  --color-surface: #FFFFFF;
  --color-surface-muted: #EAF2E8;
  --color-text: #0B1B2B;
  --color-text-secondary: #647078;
  --color-border: #E7E9E6;
  --color-sage: #A8C5AD;
  --grade-a: #16734A;
  --grade-b: #5D9B64;
  --grade-c: #C99A32;
  --grade-d: #E76632;
  --grade-f: #D94A45;
}
```

Grade colors must ALWAYS have visible letters and text labels; never use color alone. Meet WCAG AA contrast; use darker foreground text for light grade backgrounds. Desktop max width about 1280–1360px. Mobile-first with 360px-wide support, tablet around 768px, desktop at 1280px+. Use 44px touch targets and reduced-motion handling.

### Homepage `/`

- Sticky, compact navbar: brand AptSignal; `How it works`, `Compare`, `Lease checker`, `Data sources`; auth/sign-in or account menu; primary `Check an address` CTA. Responsive mobile nav.
- Above-the-fold split hero. Left: eyebrow `APARTMENT RESEARCH FOR REAL LIFE`, heading `Know the building before you sign.`, subheading `Check NYC building history, spot red flags, and compare apartments with confidence.`, large address autocomplete with keyboard support and a clear CTA. Microcopy: `Based on public NYC records. Every finding has a source.`
- Right: credible *explicitly labeled sample report* card illustrating an **example** overall indicator, category risk tiles, map preview, a couple of trends, and source attributions. All illustration/example values labeled `Illustrative example` and never represented as genuine city data. If you can render a deterministic demo report, use that in the right-hand card.
- Below fold: 3 beautiful preview panels: `Know the building`, `Compare your shortlist`, `Review the lease`; an explanation of data sources and trust limitations; how it works; final CTA; polished footer with legal pages.
- If users enter the same query from navbar/hero, reuse one search component and route to the selected actual building report.
- SEO: title/description, Open Graph basics, sitemap, robots, real semantic headings and internal links. Do not generate SEO doorway pages with invented records.

### Building page `/building/[id]`

Desktop two-column report with clear top-level building address, borough, source freshness, building ID verification status, overview score only if methodology permits it; pinned map or right rail; category score tiles. Include:

1. Overview banner with `Records found`, `Last synced`, `Match confidence`, `Coverage summary`, and optional overall indicator.
2. Category cards: `Pests & rodents`, `Bedbugs`, `Heat & hot water`, `Maintenance & violations`, `Nearby noise`. Each card shows grade OR `Not enough data`, trends, verified vs reported counts, timespan, explanation, evidence link.
3. `History`: selectable 3/12/36 month chart; clear real vs source refresh date; do not imply continuous time sampling if there are gaps.
4. `Public records`: filterable, paginated ledger of events with category, agency, status, source date, official source link, building-vs-neighborhood scope, reporting vs inspection distinction, records last checked. No PII or exact unit details.
5. Interactive block map with actual building location and nearby incident markers (only when location data is valid). Nearby noise is not necessarily the building's fault. Offer keyboard accessible list alternative.
6. `What to ask the landlord`: editable checklist generated deterministically from evidence; downloadable/printable using print stylesheet (a downloadable PDF is optional and must be real if offered).
7. `Save` (sign in when needed), `Add to comparison`, `Share` using canonical URL.
8. All states: loading skeletons, partial source outage, unverified match, empty results, stale source, mobile.

### Compare `/compare?ids=...`

- Add 2 or 3 real selected buildings; no fake results, no phantom selection.
- Side-by-side cards and a horizontally scrollable but accessible comparison table on mobile; categories, data confidence, source coverage and last update, location, landlord questions.
- Prefer user-defined importance weights for noise/pests/heat/maintenance/bedbugs. Compute deterministic weighted recommendation ONLY for comparable available grades; show missing categories and insufficient evidence. Never let weights automatically turn missing data into a perfect score.
- Shareable URL; authenticated users can save and revisit a comparison; remove/reorder buildings; ensure max 3.
- AI explains a completed real comparison when credentials configured; show evidence-linked statements and limitations. Use deterministic summary when no AI key.

### Lease checker `/lease-checker`

- Explain: `Upload a lease to identify clauses worth asking about.` No promise of legal advice or definitive legality.
- PDF-only drag/drop/upload accessible form, byte/page limits, optional rent amount/borough context, explicit consent and privacy notice, a clear `Delete this document` action. Only the authenticated uploader can see results. For unauthenticated users offer a clear login flow.
- Show private PDF viewer or readable extracted clause excerpts with reliable clause anchors and page numbers. Where text-to-PDF coordinates are accurate, highlights may be rendered; otherwise use excerpt highlights rather than misleading boxes on wrong pages.
- Findings statuses: `Standard / informational`, `Needs review`, `Potentially inconsistent with cited rule`, `Cannot determine`; never categorical "illegal" unless legal expert-verified and even then phrase cautiously.
- Each flag must show: exact user-supplied quote, page, what concern was detected, relevant *verified* source/legal rule and link, jurisdiction, effective date if available, qualifying explanation, and suggested question for landlord/legal professional.
- Initial rule pack: late-fee cap (NY AG's published guidance says smaller of $50 or 5% of monthly rent and rent considered late only after more than five days), security deposit limit (NY AG), repair rights/habitability (official primary guidance), plus optional rent-stabilization informational notice. Do NOT use unverified invented statute citations. Rules must live in a versioned curated `legal_rules` table or TS rules file and require verification before enablement.
- Rent-stabilization: can say a BUILDING *may contain* stabilized units, based on official listed registrations; MUST NOT assert a given UNIT is stabilized. Provide direct official HCR steps for requesting rent history. Absence from list does not prove absence of stabilization.
- Detect extraction failures and scanned leases; never silently return a fake completed review. Rate-limit and cap AI usage. Private storage with strict RLS and secure cleanup. Avoid sending documents to AI without explicit user consent.

### Additional pages

- `/how-it-works`: addresses, records, verification distinctions, known gaps, privacy.
- `/methodology`: data matching logic, definitions, equations, grade thresholds, version history, missing-data policy, comparison caveats, evidence confidence, all transparent.
- `/data-sources`: official source list, refresh cadence, original links, limitations, ingestion health.
- `/saved`: private saved buildings and comparisons (auth required).
- `/account`: profile preferences, deletion tools, private lease documents, logout.
- `/privacy`, `/terms`, `/disclaimer`: plain-language product-specific policies/draft disclosures marked for counsel review where needed; don't invent legal certifications.
- Correct Next.js not-found/error/loading routes.

## 4. Official NYC data integrations (use the live APIs)

Implement a `src/lib/nyc/` connector layer with one adapter per source, typed external objects, Zod parsing, API-level pagination, field normalization, and resilient error handling. Before coding each adapter, inspect the dataset's official metadata and available API fields to verify field names: `https://data.cityofnewyork.us/api/views/{DATASET_ID}.json` or its `columns.json` and official API docs. Do not silently trust assumptions about changing column names.

**Confirmed sources to integrate:**

| Source | ID / reference | Intended use | Caveat |
|---|---|---|---|
| NYC Planning GeoSearch V2 | `https://geosearch.planninglabs.nyc/v2/autocomplete` and `/v2/search` | Autocomplete, canonical NYC address, coordinates, likely BBL in `properties.addendum.pad.bbl` when present | Inspect returned properties; geocoding alone does not prove a building-level record match. |
| HPD Multiple Dwelling Registrations | `tesw-yqqr` | HPD BuildingID, BIN, block, lot, ZIP, address aliases | Covers qualifying registrations; not all NYC properties. |
| HPD Housing Maintenance Code Violations | `wvxf-dwi5` | Inspection-verified violation records, status, severity, dates | Do not equate every old/closed violation with a current unresolved hazard. |
| HPD Bedbug Reporting | `wz6d-d3jb` | Historical bedbug filings | Filings are not current real-time infestation verification. Resolve superseding filings appropriately. |
| DOHMH Rodent Inspection | `p937-wjvj` | Inspection results, active rat signs, time | Tax-lot level; lack of inspection is NOT proof of no rodents. |
| NYC 311 Service Requests 2020–present | `erm2-nwe9` | Complaints (heat, pests, noise, etc.) and timestamps | 311 reports are *not verified violations*. Data was split by decade; current dataset covers 2020 onward. Ignore unrelated noise categories. |
| NYC Planning PLUTO | `64uk-42ks` | Tax lot metadata, useful known unit/building counts and BBL linkage | Tax lot can have multiple buildings; unit count may be tax-lot-wide rather than one building. |

Socrata API host: `https://data.cityofnewyork.us/resource/{ID}.json` for compatible SODA v2 JSON access; use authenticated app token where provisioned, follow official API version/field rules. URL-encode SoQL filter parameters and parameterize trusted filter composition; no raw user SQL interpolation. API URLs must use a configured allowlist. Treat documented API field names as authoritative and verify exact field names at runtime development time.

Official source pages:

- https://geosearch.planninglabs.nyc/docs/
- https://data.cityofnewyork.us/d/tesw-yqqr
- https://data.cityofnewyork.us/d/wvxf-dwi5
- https://data.cityofnewyork.us/d/wz6d-d3jb
- https://data.cityofnewyork.us/d/p937-wjvj
- https://data.cityofnewyork.us/d/erm2-nwe9
- https://data.cityofnewyork.us/d/64uk-42ks
- https://rentguidelinesboard.cityofnewyork.us/resources/rent-stabilized-building-lists/
- https://hcr.ny.gov/office-rent-administration-ora
- https://ag.ny.gov/resources/individuals/tenants-homeowners/tenants

**Integration requirements:**

- Feature-by-feature implementation using real APIs, bounded queries (initially on-demand for selected buildings), source metadata and user-visible timestamps, TTL caching, abort/timeout, retries with exponential backoff on transient responses and 429, polite per-host concurrency, and stale-while-revalidate for previously verified records.
- Ingestion data is keyed on `(source_id, source_record_id)` and upserted idempotently. Never import the whole 23-million-row 311 or 11-million-row HPD datasets into a free-tier database by default. Use incremental windows / targeted queries and persist cursor, timestamp, and provenance. Existing source records can be corrected later: re-query rolling historical windows, reconcile changed status, and avoid duplicates.
- Keep verified violations, user-reported complaints, owner-filed bedbug reports, and rodent inspections **distinct** types. Explicitly disclose what evidence means. Record links should lead to meaningful official source pages or source dataset filtered views; don't make up per-record URLs.
- 311 noise: only use explicitly relevant categories such as nighttime commercial/residential noise; exclude helicopter/aircraft and unrelated complaints. Separate building-address records from within-radius neighborhood incidents. Use geospatial distance (e.g., 150–250m adjustable, default 200m) for nearby counts. Never imply those occurred inside the searched unit.
- 311 de-duplication: keep all distinct official `unique_key` IDs in raw source storage; create a separate **analysis grouping** for same normalized address or spatial cluster + normalized issue + local calendar day/time window, with clear approximate grouping logic and traceability to all official events. Never alter/destroy source records; don't assert distinct reports came from the same person.
- Multiple address aliases, apartment/unit suffixes, tax lots containing several buildings, fuzzy address matching, and ambiguous geocoding must be handled explicitly: prefer exact official identifiers (HPD BuildingID > BIN where appropriate > BBL with tax-lot scope) and known address aliases. Present match confidence and defer individual-building claims if a match is ambiguous. Store BBL as text preserving leading zeros.
- Respect that lack of coverage does not prove absence of a problem. No synthetic sample values under real addresses.

## 5. Architecture and proposed source layout

Use clear boundaries (adjust paths to suit framework conventions):

```text
/
  src/app/
    page.tsx
    building/[id]/page.tsx
    compare/page.tsx
    lease-checker/page.tsx
    lease-checker/[id]/page.tsx
    saved/page.tsx
    account/page.tsx
    how-it-works/page.tsx
    data-sources/page.tsx
    methodology/page.tsx
    privacy/page.tsx
    terms/page.tsx
    disclaimer/page.tsx
    api/address/autocomplete/route.ts
    api/address/resolve/route.ts
    api/buildings/[id]/route.ts
    api/buildings/[id]/records/route.ts
    api/buildings/[id]/trends/route.ts
    api/compare/route.ts
    api/advisor/route.ts
    api/leases/route.ts
    api/leases/[id]/route.ts
    api/leases/[id]/analyze/route.ts
    api/saved/route.ts
    api/internal/ingest/route.ts
  src/components/
    layout/ search/ building/ compare/ lease/ map/ ui/
  src/lib/
    nyc/ geocoding/ address-matching/ scoring/ aggregation/
    db/ auth/ ai/ pdf/ legal/ cache/ security/ observability/
  src/types/
  supabase/migrations/
  scripts/  (ingest, validate-sources, seed-synthetic, backfill, etc.)
  tests/unit/ tests/integration/ tests/e2e/
  .github/workflows/ci.yml
  .env.example
  vercel.json
  README.md
  PLAN.md
  DECISIONS.md
  IMPLEMENTATION_STATUS.md
```

All API handlers must validate incoming values; return a consistent typed response (or explicit error shape), use correct HTTP codes, and avoid leaking upstream error text or secrets. Use server-side `fetch` (or standard HTTP client) and typed mapping modules. Dynamic routes should have stable canonical UUIDs or collision-safe slugs. Never expose service-role credentials to the browser.

## 6. Database schema and security

Create actual forward SQL migrations for at least the following normalized entities. Use UUID PK unless a natural composite is clearly better; include created/updated timestamps, referential constraints, useful foreign keys, indexes and unique constraints. Define enum/check constraints where appropriate.

- `buildings`: canonical address, borough, ZIP, coordinates, `extensions.geography(Point,4326)` if enabled, nullable official identifiers (`hpd_building_id`, `bin`, `bbl`), optional `unit_count`, canonical geosearch result, match status/confidence, source provenance, verified_at.
- `building_addresses`: aliases and source-specific address identifiers, normalized keys and confidence, linked building.
- `data_sources`: official agency/name/dataset ID, source URL, last checked, upstream last changed, expected update cadence, status.
- `records`: agency source ID + immutable external record ID, building FK nullable, BBL, record kind, normalized category and subcategory, dates, status, severity, source evidence, point/geometry nullable, verified-vs-reported marker, match scope (`building`/`tax_lot`/`nearby`/`unknown`), raw allowlisted data JSONB (no unnecessary personal data), ingested_at. Unique source ID plus external record key.
- `record_groups`: deduplication/aggregation groups, algorithm version, representative metadata; link table to constituent `records`.
- `building_score_snapshots`: building, scoring version, calculated_at, category, numeric score nullable, grade A/B/C/D/F nullable, coverage status, confidence, counts/weights, explanation JSONB; meaningful version history.
- `ingestion_runs`: source, job type, start/finish, cursor/checkpoint, rows touched, warnings, error summary, health.
- `user_profiles`: auth user FK, preference settings; do not unnecessarily duplicate email.
- `saved_buildings` and `saved_comparisons`: ownership FK and stable referenced building IDs; comparison limited to 3.
- `lease_documents`: owner FK, private storage path, status (uploaded/parsing/analyzing/ready/failed/deleted), consent timestamp, page count, sanitized metadata, deletion schedule; no public URLs.
- `lease_clauses`: lease FK, page, start/end reference where possible, snippet, classification, source text location; private.
- `lease_flags`: lease/clauses, status, reason, legal rule FK, evidence cite, model info, explanation, verification state; private.
- `legal_rules`: official jurisdiction/citation URL, rule text, exact source excerpt or summary, last reviewed, effective date scope, verification state, version.
- `ai_usage`: owner FK, operation, model ID, request hashes, approximate tokens, timestamp, cost estimate (no raw lease text), rate-limit bookkeeping.

**Security:**

- Enable Supabase RLS on every exposed table. Public data tables can have carefully restricted SELECT policies where appropriate; only server/admin can insert/modify official records and scoring. Authenticated users only see/modify their own saved records, preferences, leases, clauses, flags, usage. Private `leases` storage bucket with user-specific object keys; signed access scoped to owner and short expiry. No open directory listings.
- Service-role key server-only; separate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `SUPABASE_SERVICE_ROLE_KEY`. Prevent unintended writes to official tables via client.
- Server-side authorization on every user resource route, not just UI gating. IDs are untrusted. Implement DELETE that removes stored PDF, extracted text, flags, and related user content; account deletion flow where practicable.
- Add rate limiting for autocomplete, ingestion, public report fetching and especially AI/PDF; limit upload size/pages/content and mitigate prompt injection by treating lease text as untrusted content. Add safe error logging, structured audit metadata, and timeouts.
- Supabase PostGIS extension should live in dedicated `extensions` schema, not `public`, per Supabase guidance. Index spatial columns with GIST.

## 7. Grading: transparent and defensible

This is the product's trust-critical module. Implement as a pure, independently tested deterministic scoring library, e.g., `src/lib/scoring/` with explicit version `v0.1-pilot`. **The LLM must never compute or modify official risk scores.**

### Data semantics

- Distinguish `observed verified violation`, `official inspection result`, `owner-submitted filing`, and `unverified 311 request`.
- Separate building-specific from tax-lot-level and neighborhood evidence.
- For each category calculate event count, distinct grouped events, open/unresolved as defined by source, severity if source has it, lookback window, recency, source freshness, and data matching confidence.
- When reliable unit count exists and clearly applies to the building, support per-unit normalization; otherwise never make fake per-unit claims. Normalize by observation exposure and building size before comparing if feasible. Do not apply raw count comparison blindly to 10-unit vs 300-unit buildings.
- An absent match or no records does not equal an `A` by default. Show `Not enough data` or `No relevant public records found in the selected period` plus source coverage. Likewise never say `rat-free`, `safe`, or `no issues`.

### Implementable pilot scoring policy

Create a `SCORING_CONFIG` module containing version, category weights, decay windows, reliability multipliers, and numeric-to-letter thresholds, all with unit tests and a human-readable methodology. A valid initial **pilot heuristic** (revisit after empirical validation):

1. Assign each eligible source event a severity weight: low=1, medium=3, high=6 when source objectively specifies severity; otherwise base weight=1 and never infer severity from inflammatory text alone.
2. Reliability multiplier: confirmed HPD violation=1; DOHMH positive inspection=1; bedbug owner filing=0.65; distinct grouped 311 complaint=0.25. Keep risk channels separate and don't treat all signals as equal.
3. Recency multiplier: last 365 days=1, days 366–1095=0.35, older=0.10; status adjustment for verified resolved/closed events=0.30 relative to open/unresolved. Use correct date fields and treat unknown status explicitly.
4. Aggregate into `weighted_event_burden` by category, but set `grade=null` unless matching confidence and source coverage are acceptable. For comparability, determine a documented denominator (ideally reliable building unit count for building-specific events; neighborhood incidents normalized by area/time). If needed, present only burden/count + `Insufficient comparative baseline` rather than turning arbitrary burdens into grades.
5. **Only publish citywide A–F comparison grades after implementing a reproducible citywide reference distribution** for comparable cohorts (for example unit-size band, borough, source coverage, rolling time window). Compute category risk percentile on adequate comparable data and map lower risk to A, next to B, middle to C, higher to D, highest to F. A provisional percentile scheme is A 0–20, B 20–40, C 40–60, D 60–80, F 80–100 risk percentile; call this `AptSignal risk indicator`, not an NYC government-issued grade. Freeze cohorts and snapshot version to avoid unpredictable results. With fewer than an explicit minimum supported cohort size (e.g., 100 complete comparable buildings), render `Not yet graded` instead of an arbitrary A.
6. Explain exactly which events contributed to any grade and show source coverage + score version. Recompute scores when records are corrected or new ingestion arrives. Do not grade too confidently using unverified complaints only.
7. For the homepage SAMPLE ONLY, display synthetic letter grades clearly labeled `Illustrative sample, not a real address`.

Prefer an honest ungraded but useful live report over fake beautiful letter grades. Implement the pilot as reusable scoring functions and expose grade readiness in the UI. Add golden fixture tests for severity, recency, status, dedupe and missingness. A working grade on a synthetic calibrated dataset must be shown in demo mode; real data must be appropriately qualified.

## 8. Time-series and activity trends

- Store periodic snapshots so the user can see `2 new records since last month` only if snapshot tracking supports that statement. Differentiate new records from corrections to historical records and late-published source events.
- Allow 3/12/36-month windows and graph the metrics supported by actual event times.
- Trend comparisons must consider source availability and changes in source definitions; note gaps and last-sync timestamps.
- Avoid misleading percent changes on tiny numbers (0 → 1 is not meaningful as an infinite percentage).

## 9. Recommendation engine

**Deterministic layer:** A saved user preference object weights pests, bedbugs, heat, maintenance, and noise, each 0–5, plus optional budget/commute context fields that are informational unless supported by actual integrated data. Use only comparable available categories. Explain missing category coverage and avoid fake rent prices or travel-time estimates. If all scores unavailable, rank nothing and discuss factual tradeoffs instead.

**AI layer:** When `OPENAI_API_KEY` configured and consent provided as needed, send the model a compact, structured, source-identified record summary (not an unbounded raw dataset) and preferences. Use current supported official OpenAI SDK methods and a validated structured schema such as:

```ts
type ApartmentAdvice = {
  summary: string;
  recommendedBuildingId: string | null;
  considerations: Array<{
    buildingId: string;
    statement: string;
    supportingRecordIds: string[];
    caveat: string | null;
  }>;
  unansweredQuestions: string[];
  limitations: string[];
};
```

The model must cite only record IDs it was supplied; server validates that. If it fabricates IDs, reject or strip those claims. AI is descriptive, not a source of truth. Cache by report snapshot IDs + anonymized user prefs; add strict token/output budgets, per-user daily quotas, concurrency and timeouts. Provide a readable deterministic comparison fallback when AI is missing or fails. Never pretend a deterministic fallback is AI-generated.

## 10. Lease processing detailed behavior

1. Authenticated user chooses PDF (max 10 MB; max 40 pages initial cap, configurable). Browser shows file name and privacy disclosure; user consents before external model processing.
2. Verify MIME, file magic bytes, file size, page count, upload origin and owner on the server; use Supabase private Storage with random UUID key.
3. Extract text page-by-page. Store only necessary parsed text in private data with appropriate deletion policy; never publicly expose PDF or extracted text.
4. For each page split into plausible clauses, preserving exact excerpts and page references. When heading detection is poor, favor excerpt-level findings; never invent clause boundaries.
5. Deterministic pattern detection for known official rules can run without AI. Optional OpenAI analysis supplements classification but never invents a legal citation. The only citations shown come from a curated server-side verified `legal_rules` registry.
6. Grade flags as `information`, `needs_review`, `potential_conflict`, `uncertain`; limit model to a fixed list of verified legal rule IDs and require all flags to anchor to an actual extracted lease excerpt.
7. Display processing status; support retries on transient failures; on upload/parsing/AI failure display honest error and allow delete/retry.
8. Private per-user history page with delete action. Automatically clear original PDFs and text by policy, e.g. 30 days, unless user explicitly saves them under a clear retention choice. A cron cleanup job must actually exist.
9. Prompt-injection defense: PDF content is untrusted. It must never influence system rules, select arbitrary URLs for fetching, or instruct the backend to reveal secrets.
10. Quality: include at least 20 **synthetic or consented** annotated test clauses across normal, ambiguous, and concerning examples, and measure precision/recall or at least accuracy for deterministic extraction/flag grounding. No unlicensed real leases.

**Important:** Renter-law content must be reviewed by qualified counsel before any legal-advice-like launch. Do not label the service a law firm or definitive legal audit. Use `Potential issue to review` language. Keep a legal-rules revision log and source URLs.

## 11. API contract

Implement route handlers for the following resources (exact route folder syntax may vary with Next.js):

| Method / route | Input | Output |
|---|---|---|
| `GET /api/address/autocomplete?q=` | 3–120 chars | 0–8 labeled candidate addresses with coordinates & safe IDs |
| `GET /api/address/resolve?q=` | full search string / selected candidate ID | canonical address, confidence, optional BBL/BIN/HPD identity, collision-safe building ID |
| `GET /api/buildings/:id` | UUID or validated slug | summary, coverage, scores, source freshness, matched identifiers |
| `GET /api/buildings/:id/records?category=&cursor=&limit=` | filters/pagination | normalized cited records and next cursor |
| `GET /api/buildings/:id/trends?window=` | 3/12/36 | timestamps, counts, snapshots, data availability |
| `POST /api/compare` | 2–3 building IDs, weights | deterministic comparisons with missingness details |
| `POST /api/advisor` | building IDs + safe preferences | grounded typed AI or explicit non-AI fallback |
| `GET/POST/DELETE /api/saved` | authenticated user resources | own saved objects |
| `POST /api/leases` | private upload initiation / metadata | private document ID and upload method |
| `GET/DELETE /api/leases/:id` | authenticated ID | owned doc/status/results or permanent deletion |
| `POST /api/leases/:id/analyze` | explicit consent | status/job result or async processing trigger |
| `POST /api/internal/ingest` | verified `CRON_SECRET` auth | bounded ingestion batch health; never public |

Use normal HTTP semantics, Zod schemas, cursor pagination, enforced max lengths, caching, no accidental POST side effects from GET. Return structured `source_error`/`partial` when upstream calls fail. Document all endpoints and sample responses in `docs/API.md`.

## 12. Source adapter design and data pipeline

Create interface `DataSourceAdapter` with: `sourceId`, `datasetId`, `fetchForBuilding(identity, window)`, `normalize(raw)`, `upsert(records)`, `getHealth()`. Use source-specific identity as needed (HPD BuildingID, BBL, BIN, zip+canonical address), and store link scopes. Independently test each adapter with real-shaped mocked payloads. Provide an optional live smoke script that checks metadata and fetches a tiny page; do not make unit tests depend on external network availability.

Implement `resolveBuildingIdentity` with deterministic matching and confidence levels: exact HPD BuildingID, verified BIN, exact address+Borough+ZIP+BBL, matched BBL tax-lot scope, ambiguous. Address aliases and corner properties are expected. Do not stitch records between adjacent buildings just because coordinates are close. Record unresolvable incidents as `unmatched` or `nearby` rather than assigning to a building.

Persist source refresh checkpoints and status. When source fails, present last good data with `stale` badge, not as live data. Heavy data ingestion must be independent of request page generation and safe to retry. Refresh recent active events daily initially; historical corrections in rolling windows. Record source revision/version when discoverable.

## 13. Performance, SEO, accessibility and reliability

- Aim for Lighthouse accessibility >= 95 and good Core Web Vitals; optimize actual user flows rather than obsessing over one score.
- Accessible autocomplete combobox with `aria-expanded`, `aria-controls`, active descendant, keyboard arrows/Enter/Escape, focus management and clear no-results state.
- Semantic headings, labels, table headers and captions, status announcements, visible keyboard focus, contrast, screen-reader labels for grade cards; responsive maps and data tables.
- Image/placeholders should be locally owned and optimized, no unauthorized rental photos; UI should still look complete without any photography.
- Debounce autocomplete; cache bounded public API results; lazy load maps and PDF viewer; paginate record lists; use React Server Components where sensible; manage upstream 429s.
- Add tests for all empty/error/loading states; handle offline/timeout/service auth issues without crashing whole page.
- Use a CSP and standard security headers where practical; no user HTML injection; no remote fetch to arbitrary URLs; avoid exposing upstream tokens.

## 14. Suggested environment variables

Generate `.env.example` with comments, mark mandatory vs optional:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=
NYC_SOCRATA_APP_TOKEN=
NEXT_PUBLIC_MAP_STYLE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
CRON_SECRET=
SENTRY_DSN=
DEMO_MODE=true
AI_ENABLED=false
LEASE_AI_ENABLED=false
MAX_AI_REQUESTS_PER_USER_PER_DAY=5
MAX_LEASE_PDF_MB=10
MAX_LEASE_PDF_PAGES=40
```

Secrets must not use `NEXT_PUBLIC_`. On first `npm run dev`, with no external credentials, project still renders all pages and demo flows using **explicitly labeled synthetic fixtures** and an in-memory or fixture-backed provider. When Supabase/API credentials are configured, the actual live path should use them. Do not silently switch to demo on a user's real address request; report external service failure. Include exact auth redirect setup for local/prod.

## 15. Quality gates, demos and acceptance tests

Implement the following end-to-end tests with reliable mock fixtures:

**P0 basic experience**

- Homepage looks polished at 375px, 768px and 1440px and has no dead navigation.
- Address autocomplete keyboard navigation, selection, and route to report works. Invalid NYC addresses return an honest no-match state.
- Building report renders source-linked records, map or honest map fallback, categories, confidence and methodology explanations.
- Missing or ambiguous building data does NOT get a fake grade.
- Real-mode network failure displays an explicit error/stale state, not fictitious data.
- Comparison of 2–3 buildings works and 4th is rejected; a user can adjust weights; missing metrics never count as zero risk.
- Authenticated save/unsave works; unauthorized reads are blocked by actual RLS policies.
- Data provenance is visible in every finding and official citations open.

**P1 advanced experience**

- AI advisor uses validated source IDs and falls back truthfully on missing key/rate limits.
- Lease upload verifies PDF and ownership; genuine text PDF extracts pages/clauses; scanned PDF gets honest unsupported state; simulated lease flag anchors to actual text and verified legal rules; deletion truly removes private artifacts.
- SQL migrations apply from clean DB; ingestion can rerun twice without duplicate official records.
- API tests cover 429, malformed source payload, null coordinates, missing identifiers, duplicate 311 events, stale/late-corrected data, aborted fetch, and unsafe input.
- Sufficient synthetic grading baselines produce deterministic grade snapshots while sparse real data stays ungraded.

**Security regressions**

- Cross-user lease access returns 403/404; a signed private PDF URL cannot be enumerated or made public.
- Anonymous users cannot create/modify source records or see other users' saved reports.
- Unauthorized cron endpoint fails; attempted arbitrary URL injection to source connector fails.
- Upload of non-PDF or too large PDF fails cleanly; prompt-injection text in lease is ignored as instruction.

**Execution and delivery**

Required npm scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:migrate` (or clearly documented Supabase CLI equivalent), `seed:demo`, `check:sources`, `ingest:sample`.

Use deterministic seeds for two or three invented addresses that are blatantly marked `DEMO` (prefer fictional street names rather than real addresses to avoid misattribution). If geocoding fixtures use real coordinate areas, still label all records synthetic. Add `README.md` explaining setup, project structure, sample/demo mode, migration, local Supabase setup, data sources, security rules, AI costs, current limitations, and Vercel deploy. `docs/ARCHITECTURE.md`, `docs/SCORING.md`, `docs/DATA_SOURCES.md`, `docs/LEASE_SAFETY.md`, `docs/API.md` should reflect the actual implementation, not aspirations.

## 16. Implementation phases (proceed through them without repeated confirmation)

### Phase A — Working shell and design system

Initialize Next.js, components/tokens, navigation, homepage, responsive layouts, static informational pages, demo data contracts. Complete a screenshot-level, polished landing page. Do not build only the landing page and stop.

### Phase B — Data and building report

Implement Supabase schema/RLS, address autocomplete, identity matching, official data adapters, ingestion/checkpoints, building report UI, source ledger, maps, trends, methodology. Do at least one real-source live smoke test if network is available. Distinguish live data vs synthetic fixture mode.

### Phase C — Comparison, personalization, accounts

Implement comparison, weighting, saved buildings/comparisons, authentication, and grounded AI advisor fallback.

### Phase D — Lease reader

Build private document lifecycle, text extraction, curated rules registry, deterministic flags, optional AI classification, results, deletion, security tests.

### Phase E — Reliability and production handoff

Test, run build, fix regressions, add CI, observability, environment docs, Vercel config, error states, detailed `IMPLEMENTATION_STATUS.md`. Audit actual vs planned features. Prioritize a completely working P0 vertical slice before expanding P1; don't leave half-integrated APIs just to check boxes.

**If execution time or tool availability is limited:** implement the highest-priority functionality and explain exactly what remains. Do not falsely claim full completion. Maintain testable code and leave a clear prioritized continuation checklist.

## 17. Output checklist for Codex

At the end provide:

1. An actual repo with runnable code, SQL migrations, tests, fixtures and docs.
2. A brief directory tree and completed feature list with **live / demo / requires credentials** markers.
3. Commands to boot it (`npm install`, env setup, migration, `npm run dev`) and test it.
4. Exact credentials / keys a human needs to provision and links to official docs.
5. Results of commands actually run (typecheck, lint, unit tests, Playwright, build), with failures named.
6. Known data/legal/security limitations and critical launch blockers.
7. Deployment instructions for Vercel and Supabase, including map tiles, source keys, cron auth, and uploaded-PDF security.

**Start building now. Do not output just a plan, pseudo-code, concept mockup, or prompt rewrite.**
