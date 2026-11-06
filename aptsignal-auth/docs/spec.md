# Hearthstone Hub — Product & Technical Spec

> *Where we put the heart in your hub.*

| | |
|---|---|
| **Status** | Draft v1 |
| **Last updated** | October 29, 2026 |
| **Stack** | Next.js (React + TypeScript) · Supabase (Postgres + PostGIS) · Gemini · Vercel |

---

## Table of contents

1. [Overview](#1-overview)
2. [Users and core flows](#2-users-and-core-flows)
3. [Features](#3-features)
4. [Data sources](#4-data-sources)
5. [Data pipeline](#5-data-pipeline)
6. [Grading](#6-grading)
7. [Database](#7-database)
8. [API routes](#8-api-routes)
9. [AI layer (Gemini)](#9-ai-layer-gemini)
10. [Frontend](#10-frontend)
11. [Design system](#11-design-system)
12. [Tech stack](#12-tech-stack)
13. [Auth, security and privacy](#13-auth-security-and-privacy)
14. [Testing and monitoring](#14-testing-and-monitoring)
15. [Milestones](#15-milestones)
16. [Open questions](#16-open-questions)

---

## 1. Overview

### Pitch

Type in an NYC address and see whether the apartment has problems — rats, bedbugs, repairs the city flagged, or noisy bars nearby. Each problem gets a simple **A–F grade**. Line up **2–3 apartments side by side** to pick the best one. An **AI advisor** weighs the results against your own circumstances (light sleeper, kids, pets, budget) to help you decide.

### Goals

- Turn scattered NYC public records into one plain-language building report.
- Make buildings comparable with consistent, city-relative grades.
- Track change over time ("2 new problems since last month").
- Give renters concrete questions to ask the landlord before signing.

### Non-goals (for now)

- Unit-level data (city records are mostly building-level).
- Rent prices or listings.
- Legal advice of any kind.
- Coverage outside the five boroughs.

---

## 2. Users and core flows

**Primary user:** someone actively apartment hunting in NYC, usually comparing a short list of places under time pressure.

### Flow A — Check one building
1. Type an address in the search bar.
2. Pick the matching suggestion.
3. Land on the report: overall summary, A–F grade per category, map of the block, landlord questions.

### Flow B — Compare apartments
1. From a report, tap **Add to compare** (up to 3).
2. Open **Compare** to see grades side by side, with the best in each row highlighted.
3. Optionally ask the AI advisor which fits them best.

### Flow C — Personalized advice (signed in)
1. Fill in "My situation" on the profile (e.g., light sleeper, works from home, has a dog).
2. On a report or compare page, tap **Ask Hearthstone**.
3. Get a short, reasoned recommendation tied to the actual data.

### Flow D — Watch a building (signed in)
1. Save a building.
2. Come back later and see what changed since the last report.

---

## 3. Features

| # | Feature | Description | Phase |
|---|---|---|---|
| F1 | **Address search** | Autocomplete NYC addresses; resolve to a building ID (BBL/BIN) and coordinates. | MVP |
| F2 | **Building report** | Grades per category, issue counts, recent issue timeline, block map. | MVP |
| F3 | **Block map** | Building marker plus nearby complaint markers, filterable by category. | MVP |
| F4 | **A–F grades** | One grade per category, relative to the rest of NYC. | MVP |
| F5 | **Landlord questions** | Checklist of questions generated from the building's actual problems. | MVP |
| F6 | **Compare** | 2–3 buildings side by side. | MVP |
| F7 | **Report history** | Saved snapshots; "new / resolved since last report." | MVP |
| F8 | **Accounts** | Sign in, save buildings, save comparisons, store "My situation." | MVP |
| F9 | **AI advisor** | Gemini-powered, personalized recommendation from report data + user's circumstances. | MVP |
| F10 | **Lease review** | Upload a lease PDF; AI flags clauses worth asking about. | Phase 2 |

### Grade categories

| Category | What it means | Scope |
|---|---|---|
| **Repairs** | Housing code violations the city issued (leaks, mold, broken locks, etc.) | Building |
| **Heat & hot water** | Complaints about no heat or hot water | Building |
| **Rats & pests** | Failed rodent inspections, pest-related violations | Building |
| **Bedbugs** | Owner-reported bedbug infestations | Building |
| **Noise** | Noise complaints (bars, parties, construction) near the building | ~1-block radius |

---

## 4. Data sources

All sources are free. NYC Open Data is served through the Socrata SODA API (JSON, supports filtering with SoQL). Register a free **Socrata app token** to avoid tight rate limits.

| Source | Used for | Join key | Notes |
|---|---|---|---|
| **NYC GeoSearch** (Planning Labs) | Address autocomplete + geocoding | Returns BBL, BIN, lat/lon | Free, no key. Fallback: NYC Geoclient API (free key). |
| **HPD Housing Maintenance Code Violations** | Repairs; pest violations | BBL / BIN | Has class (A/B/C severity) and open/closed status. |
| **HPD Housing Maintenance Code Complaints** | Heat & hot water; repair complaints | BBL | Complaints, not confirmed violations — weight lower. |
| **DOHMH Rodent Inspections** | Rats | BBL | Use inspection result (e.g., active rat signs / failed). |
| **HPD Bedbug Reporting** | Bedbugs | BBL / BIN | Annual owner filings; infested units + eradicated units. |
| **311 Service Requests** | Noise; heat/hot water; nearby problems | Lat/lon, address | Very large; always query by radius + date window. |
| **MapPLUTO** (DCP) | Unit count, year built, building footprint | BBL | Needed to normalize "problems per unit." |
| **Map tiles** | Basemap for MapLibre | — | Free vector tiles (e.g., OpenFreeMap or Protomaps); confirm terms. |

> **Note:** Dataset IDs/endpoints should be confirmed on data.cityofnewyork.us before build, and pinned in a single config file (`lib/sources.ts`) so they're easy to update.

This is all API access, not HTML scraping — no page parsing or headless browsers needed.

---

## 5. Data pipeline

### 5.1 Find the building

1. Client calls `/api/geocode?q=...` as the user types (debounced ~250 ms).
2. Server calls GeoSearch and returns top 5 matches with label, BBL, BIN, lat/lon.
3. On selection, navigate to `/building/[bbl]`.
4. Upsert the building into `buildings` (with PLUTO unit count if missing).

### 5.2 Get the info

When a report is requested and there's no fresh snapshot (older than 24 hours):

| Query | Filter | Window |
|---|---|---|
| HPD violations | `bbl = X` | Last 3 years; all currently open |
| HPD complaints | `bbl = X` | Last 12 months |
| Rodent inspections | `bbl = X` | Last 2 years |
| Bedbug filings | `bbl = X` | Latest 2 filing years |
| 311 nearby | within ~150 m of building | Last 12 months |

Each response is validated with **Zod** before use, then normalized into a common `issues` shape:

```ts
type Issue = {
  source: 'hpd_violation' | 'hpd_complaint' | 'rodent' | 'bedbug' | '311';
  sourceId: string;          // original record ID, for dedupe
  bbl: string | null;        // null for nearby 311 not tied to this building
  category: 'repairs' | 'heat' | 'pests' | 'bedbugs' | 'noise';
  severity: 1 | 2 | 3;       // e.g., HPD class A/B/C → 1/2/3
  status: 'open' | 'closed';
  observedAt: string;        // ISO date
  description: string;       // short, human-readable
  lat?: number;
  lon?: number;
  distanceM?: number;        // for nearby complaints
};
```

### 5.3 Clean it up

**Drop things that don't matter for an apartment:**
- 311 types like *Noise – Helicopter*, aircraft, and other non-local sources.
- 311 requests closed as duplicates or "not within jurisdiction."
- Records missing both a date and a location.

Keep the exclusion list in config (`lib/cleaning-rules.ts`) so it's easy to tune.

**Collapse repeats:**
- Same complaint type + same location + same "night" (6 pm–6 am window) → count **once**.
- Same complaint type + same building + same calendar day (daytime) → count **once**.
- HPD records are already de-duplicated by their own IDs.

**Weight by seriousness:**
- HPD Class C (immediately hazardous) = 3, Class B = 2, Class A = 1.
- Open violations count more than closed ones (e.g., ×1.5).
- Confirmed violations count more than unconfirmed complaints.

---

## 6. Grading

Each category gets its own **A–F grade** by comparing the building to the rest of NYC.

### 6.1 Score per category

- **Building categories** (repairs, heat, pests, bedbugs): weighted issue count **per residential unit**, over the category's time window. Per-unit keeps large buildings from being penalized for being large.
- **Noise:** de-duplicated complaints within the radius, per 12 months.

### 6.2 Citywide baseline

A scheduled job computes the citywide distribution of each score (using SoQL `group by bbl` counts + PLUTO units) and stores percentile cutoffs in `grade_baselines`.

### 6.3 Grade cutoffs (starting point — tune with real data)

| Grade | Building is cleaner than… |
|---|---|
| **A** | 80%+ of comparable NYC buildings (or zero issues) |
| **B** | 60–80% |
| **C** | 40–60% |
| **D** | 20–40% |
| **F** | Bottom 20% |

Compare against similar buildings where possible (e.g., bucket by size: 1–5 units, 6–20, 21–100, 100+).

### 6.4 Overall summary

No single "overall" grade by default — renters care about different things. Show the category grades plus a one-line plain summary ("Few repair problems, but frequent late-night noise nearby").

---

## 7. Database

Supabase Postgres with **PostGIS** enabled. Row Level Security (RLS) on every user-owned table.

### Public building data

**`buildings`**
| Column | Type | Notes |
|---|---|---|
| `bbl` | text, PK | Borough-Block-Lot |
| `bin` | text | Building ID |
| `address` | text | Normalized label |
| `borough` | text | |
| `geom` | geography(Point) | PostGIS point |
| `units_res` | int | From PLUTO |
| `year_built` | int | From PLUTO |
| `updated_at` | timestamptz | |

**`issues`** — normalized records (see `Issue` type above)
- Unique index on `(source, source_id)` for dedupe.
- GIST index on `geom` for radius queries.

**`report_snapshots`**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `bbl` | text, FK | |
| `generated_at` | timestamptz | |
| `metrics` | jsonb | Counts and scores per category |
| `grades` | jsonb | `{ repairs: 'B', noise: 'D', ... }` |
| `issue_ids` | text[] | Source IDs included, for diffing |

"Since last month" = compare the latest snapshot to the one closest to 30 days earlier: new IDs = new problems, missing open IDs = resolved.

**`grade_baselines`**
| Column | Type |
|---|---|
| `category` | text |
| `size_bucket` | text |
| `computed_at` | timestamptz |
| `cutoffs` | jsonb |

### User data

**`profiles`** — `user_id` (FK auth.users), `display_name`, `situation` (jsonb: sleep, pets, kids, work-from-home, priorities)

**`saved_buildings`** — `user_id`, `bbl`, `nickname`, `unit`, `rent`, `notes`, `created_at`

**`comparisons`** — `id`, `user_id`, `bbls` (text[], max 3), `created_at`

**`ai_analyses`** — `id`, `user_id`, `input_hash`, `output` (jsonb), `created_at` *(cache to avoid repeat Gemini calls)*

**`leases`** *(Phase 2)* — `id`, `user_id`, `storage_path`, `extracted_text`, `analysis` (jsonb)

---

## 8. API routes

Next.js Route Handlers under `/app/api`.

| Method | Route | Purpose | Auth |
|---|---|---|---|
| GET | `/api/geocode?q=` | Address autocomplete | Public |
| GET | `/api/buildings/[bbl]/report` | Latest report (builds one if stale) | Public |
| GET | `/api/buildings/[bbl]/history` | Snapshot list + diff | Public |
| GET | `/api/compare?bbls=a,b,c` | Reports for 2–3 buildings | Public |
| POST | `/api/ai/advice` | Personalized recommendation | Signed in |
| POST | `/api/ai/questions` | Landlord question list | Public (rate-limited) |
| POST | `/api/saved` / DELETE `/api/saved/[bbl]` | Save / unsave | Signed in |
| POST | `/api/leases` | Upload + analyze lease (Phase 2) | Signed in |
| GET | `/api/cron/refresh` | Refresh saved buildings + baselines | `CRON_SECRET` |

**Middleware:** refresh the Supabase session; protect `/account` and signed-in API routes; basic rate limiting on AI and report-build routes.

### Scheduled jobs (Vercel Cron)

| Job | Schedule | Work |
|---|---|---|
| Refresh saved buildings | Daily | New snapshot for every saved building |
| Recompute baselines | Weekly | Citywide percentile cutoffs |

> Vercel functions have execution time limits. If the baseline job outgrows them, move it to a Supabase Edge Function or a GitHub Actions workflow writing to Supabase.

---

## 9. AI layer (Gemini)

### Principles

- **Data in, reasoning out.** Gemini only sees the structured report JSON and the user's stated situation. It must not invent records.
- **Show the why.** Every recommendation points to the specific grades or counts that drove it.
- **Fair housing.** Advice is about building conditions only. Never factor in or comment on neighborhood demographics, race, religion, national origin, or other protected characteristics.
- **Not legal advice.** Lease review flags things to ask about; it doesn't interpret the law.
- **Structured output.** Request JSON; validate with Zod; retry once on failure, then fall back to a non-AI view.

### Prompt 1 — Personalized advice

**Input:** 1–3 report JSONs + `situation` JSON.

```text
You are Hearthstone, an assistant helping an NYC renter choose an apartment.
Use ONLY the building data provided. If something isn't in the data, say so.
Do not consider or mention neighborhood demographics or any protected characteristic.

Renter's situation:
{situation_json}

Buildings:
{reports_json}

Return JSON:
{
  "summary": "2–3 sentences in plain language",
  "ranking": [{ "bbl": "...", "fit": "great|ok|poor", "reasons": ["..."] }],
  "watch_outs": ["..."],
  "data_gaps": ["..."]
}
```

### Prompt 2 — Landlord questions

**Input:** one report JSON. **Output:** 5–8 specific questions tied to real issues, e.g., *"There were 4 open heat violations last winter — what was fixed, and when?"* A static fallback list is shown if the AI call fails.

### Prompt 3 — Lease review (Phase 2)

**Input:** lease text extracted with PDF.js (digital PDFs only; scanned leases out of scope at first). **Output:** flagged clauses (fees, renewal, repairs responsibility, pets, subletting) with a short plain-language note and "ask about this" suggestion.

---

## 10. Frontend

Next.js App Router, React, TypeScript, Tailwind, shadcn/ui, Motion (used sparingly).

### Pages

| Route | Page | Contents |
|---|---|---|
| `/` | **Home** | Logo + tagline, big centered search bar, 3-step "how it works," sample report teaser. |
| `/building/[bbl]` | **Report** | Address header; grade cards (one per category); block map; "what changed"; issue timeline; landlord questions; *Add to compare*, *Save*, *Ask Hearthstone*. |
| `/compare` | **Compare** | 2–3 columns; one row per category; best grade per row highlighted; AI recommendation panel. |
| `/account` | **Profile** | "My situation" form, saved buildings (with change badges), saved comparisons, sign out. |
| `/login` | **Sign in** | Email magic link + Google. |
| `/lease` | **Lease review** | Upload, results (Phase 2). |

### Home screen

- Warm Ivory background, Deep Navy headline, Forest Green primary button.
- Search bar is the hero element: white surface, light border, autocomplete dropdown.
- Below: three short cards — *Search an address → See the grades → Compare & decide*.

### Report page layout

```
┌──────────────────────────────────────────────────┐
│ 123 Example St, Brooklyn        [Save] [Compare] │
│ 42 units · built 1931 · updated today            │
├──────────────────────────┬───────────────────────┤
│  Grade cards             │                       │
│  Repairs     B           │      Block map        │
│  Heat        A           │   (MapLibre GL JS)    │
│  Rats/pests  C           │                       │
│  Bedbugs     A           │                       │
│  Noise       D           │                       │
├──────────────────────────┴───────────────────────┤
│ What changed: 2 new problems since last month    │
├──────────────────────────────────────────────────┤
│ Questions to ask the landlord   [Ask Hearthstone]│
└──────────────────────────────────────────────────┘
```

On mobile, stack: header → grades → map → changes → questions.

### Profile page

- **My situation:** toggles/chips (light sleeper, works from home, kids, pets, sensitive to pests) + "what matters most" ranking.
- **Saved buildings:** list with current grades and a "2 new" badge when things changed.
- **Saved comparisons:** reopen in one tap.

### Map

- MapLibre GL JS with a free vector tile source.
- Building marker in Forest Green; complaint markers in grade colors by category.
- ~150 m radius circle; category filter chips; click a marker for a short description + date.

### Figma

Recommended before building: low-fi wireframes of Home, Report, Compare, and Profile (desktop + mobile), then a hi-fi pass using the tokens below.

---

## 11. Design system

### Brand

- **Name:** Hearthstone Hub
- **Tagline:** Where we put the heart in your hub

### CSS tokens

```css
:root {
  /* Brand */
  --color-primary: #0D5449;
  --color-primary-hover: #083D35;
  --color-heading: #0B1B2B;

  /* Backgrounds */
  --color-background: #F8F7F3;
  --color-surface: #FFFFFF;
  --color-surface-muted: #EAF2E8;

  /* Text */
  --color-text: #0B1B2B;
  --color-text-secondary: #647078;

  /* Borders */
  --color-border: #E7E9E6;

  /* Accents */
  --color-sage: #A8C5AD;

  /* Building Grades */
  --grade-a: #16734A;
  --grade-b: #5D9B64;
  --grade-c: #C99A32;
  --grade-d: #E76632;
  --grade-f: #D94A45;
}
```

### Primary palette

| Color | Hex | Usage |
|---|---|---|
| Deep Navy | `#0B1B2B` | Headings, logo, primary text |
| Forest Green | `#0D5449` | Buttons, links, primary brand color |
| Warm Ivory | `#F8F7F3` | Main background |
| Pure White | `#FFFFFF` | Cards, search bar, report panels |
| Sage Green | `#A8C5AD` | Secondary accents, icons |
| Pale Sage | `#EAF2E8` | Subtle highlights, grade backgrounds |
| Slate Gray | `#647078` | Secondary text, descriptions |
| Light Gray | `#E7E9E6` | Borders and dividers |

### Grade colors

| Grade | Color | Hex |
|---|---|---|
| A | 🟢 Dark Green | `#16734A` |
| B | 🟢 Soft Green | `#5D9B64` |
| C | 🟡 Golden Amber | `#C99A32` |
| D | 🟠 Burnt Orange | `#E76632` |
| F | 🔴 Muted Red | `#D94A45` |

**Accessibility:** always show the letter alongside the color (never color alone), and check text contrast on grade backgrounds — Golden Amber and Burnt Orange need dark or bold text at small sizes.

---

## 12. Tech stack

| Component | Technology | Why |
|---|---|---|
| Frontend | React + Next.js | Fast, responsive website with SEO support |
| Language | TypeScript | Type safety throughout (frontend, backend, data jobs) |
| Styling | Tailwind CSS | Precise control over the custom design |
| UI components | shadcn/ui + Radix UI | Accessible, customizable components |
| Animations | Motion | Smooth interactions without excessive animation |
| Backend | Next.js Route Handlers | Backend APIs in the same project |
| Database | Supabase PostgreSQL | Relational data, analytics, historical records |
| Geographic database | PostGIS | Search complaints and violations by location |
| Authentication | Supabase Auth | User accounts and saved apartments |
| File storage | Supabase Storage | Private storage for uploaded leases |
| Maps | MapLibre GL JS | Interactive maps and building markers |
| Data processing | Node.js + TypeScript | Fetch, normalize, and update government records |
| Scheduled tasks | Vercel Cron (initially) | Refresh records automatically |
| AI | Gemini API | Personalized apartment analysis and lease review |
| PDF processing | PDF.js | Extract text from digital leases |
| Validation | Zod | Validate API responses and application data |
| Testing | Vitest + Playwright | Automated logic and browser testing |
| Hosting | Vercel | Deployment, HTTPS, and preview environments |
| Version control | GitHub | Source control and deployment integration |
| Monitoring | Sentry | Catch production errors |

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only
SOCRATA_APP_TOKEN=
GEMINI_API_KEY=                 # server only
CRON_SECRET=
SENTRY_DSN=
NEXT_PUBLIC_MAP_STYLE_URL=
```

---

## 13. Auth, security and privacy

- **Supabase Auth:** email magic link + Google sign-in.
- **RLS:** users can only read/write their own `profiles`, `saved_buildings`, `comparisons`, `ai_analyses`, `leases`. Building data is public-read, service-role-write.
- **Secrets:** Gemini key, service-role key, and Socrata token stay server-side only.
- **Leases:** private Storage bucket, signed URLs, user can delete anytime (deletes file + extracted text).
- **Rate limits:** per-IP on report builds and AI routes.
- **Disclaimers:** grades reflect public records, which can be incomplete or delayed; not legal advice.

---

## 14. Testing and monitoring

**Vitest (unit)**
- Cleaning rules (helicopter noise dropped; 10 complaints in one night → 1).
- Severity weighting and per-unit scoring.
- Grade cutoffs and edge cases (zero units, missing PLUTO data).
- Snapshot diffing (new vs. resolved).
- Zod schemas against saved sample API responses.

**Playwright (end-to-end)**
- Search → report renders with grades and map.
- Add two buildings → compare page shows both.
- Sign in → save building → appears on profile.

**Sentry** for runtime errors; log every failed upstream fetch with source and query.

---

## 15. Milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | **Foundation** | Repo, Next.js + Tailwind + shadcn set up; Supabase project with PostGIS; Vercel previews working. |
| M2 | **Find + fetch** | Address search works; all sources fetched, validated, normalized, cleaned for one building. |
| M3 | **Grades + report page** | Baselines computed; report page with grade cards and map. |
| M4 | **History + accounts** | Snapshots + "what changed"; sign in; save buildings; profile page. |
| M5 | **Compare + AI** | Compare page; Gemini advice and landlord questions with fallbacks. |
| M6 | **Polish + launch** | Mobile pass, accessibility check, tests green, Sentry live. |
| P2 | **Lease review** | Upload, PDF.js extraction, Gemini clause flags. |

---

## 16. Open questions

1. **Noise radius:** 150 m (~1 block) or configurable per user?
2. **Grade cutoffs:** keep quintiles, or tune once we see the real distribution?
3. **Size buckets:** are four buckets enough to keep comparisons fair?
4. **Overall grade:** do we ever want a single headline grade, or only per-category?
5. **Map tiles:** which free provider, and do its terms fit our usage?
6. **AI access:** signed-in only, or a limited number of free uses for guests?
7. **Baseline job:** will it fit in Vercel Cron limits, or move to Supabase/GitHub Actions from the start?
8. **Figma:** who owns wireframes, and are they needed before M3?
