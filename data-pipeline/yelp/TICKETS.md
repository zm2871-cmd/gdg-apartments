# Yelp (Fusion / Places API) — Tickets

Branch: `data-yelp` · Folder: `data-pipeline/yelp/`

Goal: for a resolved building, find its Yelp business and show its rating, review count and review
excerpts, within Yelp's strict terms.

## API facts these tickets rely on

Sources, read 2026-11-06:
- docs.developer.yelp.com: fusion-intro, authentication, rate-limiting, and the business_search,
  business_match, business_info and business_reviews references.
- terms.yelp.com/developers: api_terms (updated 2026-09-22) and display_requirements.

- **Base and auth:** base URL `https://api.yelp.com/v3`. Send `Authorization: Bearer <API_KEY>`.
  All endpoints use GET.
- **Search:** `/businesses/search` takes `latitude` and `longitude` (or `location`), `radius` in
  meters (up to 40000), `categories` (aliases, e.g. `apartments`), `limit` (max 50), `offset` and
  `sort_by` (`best_match`, `rating`, `review_count` or `distance`). Businesses with no reviews are
  never returned.
- **Match:** `/businesses/matches` requires `name`, `address1`, `city`, `state` (e.g. `NY`) and
  `country` (`US`). It also takes `postal_code`, `limit` (1–10) and `match_threshold`
  (`none`, `default` or `strict`). It returns no confidence score.
- **Details:** `/businesses/{id}` returns `rating` (1–5 in steps of 0.5), `review_count`, `url`,
  `coordinates`, `location` and `categories`.
- **Reviews:** `/businesses/{id}/reviews` returns at most **3 excerpts**, in Yelp's sort order. It
  needs the **Enhanced or Premium plan**; the trial and Starter plans don't include it. Fields:
  `id`, `url`, `text` (truncated with "..."), `rating`, `time_created` and
  `user{name,profile_url,image_url}`.
- **Limits:** the trial lasts 30 days with 300 calls a day, reset at midnight UTC. A product may not
  launch publicly on a trial key. Usage is in the `RateLimit-DailyLimit`, `RateLimit-Remaining` and
  `RateLimit-ResetTime` headers. A 429 means `TOO_MANY_REQUESTS_PER_SECOND` (per-second rate) or
  `ACCESS_LIMIT_REACHED` (daily quota).
- **Errors:** 400 `INVALID_REQUEST` · 401 `TOKEN_INVALID` or `UNAUTHORIZED_API_KEY` ·
  403 `AUTHORIZATION_ERROR` · 404 `NOT_FOUND` · 500 / 503.
- **Terms that shape the design:**
  - Store no Yelp content for more than **24 hours**. Business IDs may be stored, for back-end
    matching only.
  - Do not use Yelp data to build your own business-listing database.
  - **Never blend Yelp stars with other ratings** or into a combined score, and don't show them
    "in conjunction with other user-generated content".
  - Use Yelp-branded stars and the Yelp logo, link to the Yelp page, and show the stars next to the
    review count.
  - **Do not send Yelp content to any generative AI model.** This rules out the `/api/advisor` and
    lease-analysis flows.
  - Delete Yelp content within 24 hours when Yelp asks.

---

### YELP-01 — Plan, key and terms sign-off · S
- Create the app at yelp.com/developers/v3/manage_app and add `YELP_API_KEY` to `.env` and the
  Vercel env. Never commit the key.
- Decide on a plan. The trial has no reviews endpoint and forbids a public launch. Check prices at
  business.yelp.com/data/products/places-api.
- Confirm with the team that we accept the terms above: the 24-hour cache, no blended scores, and no
  Yelp content sent to AI.
- **Done when:** the plan choice and terms sign-off are written in this file, and a `curl` search
  works.

### YELP-02 — Yelp client · S
- Add `lib/yelp.js` with a `yelpGet(path, params)` helper that uses built-in `fetch` and follows the
  error handling in `lib/socrata.js`.
- On `TOO_MANY_REQUESTS_PER_SECOND`, retry with backoff. On `ACCESS_LIMIT_REACHED`, stop the run and
  don't retry. Log `RateLimit-Remaining`.
- **Done when:** unit tests with mocked `fetch` cover success, both 429 cases, 401 and 404.

### YELP-03 — Match a building to a Yelp business · M
- Call `/businesses/search` with the building's lat/lon, `radius=100`,
  `categories=apartments,condominiums,propertymgmt`, `sort_by=distance` and `limit=10`.
- Accept a candidate only if it is within about 50 m and its street number matches the building
  address. Otherwise return `null`; most buildings have no Yelp page.
- If a search finds nothing but a building name is known, fall back to `/businesses/matches` with
  `match_threshold=strict`.
- Store only `yelp_business_id` on the building. The terms allow keeping it.
- **Done when:** fixtures of 5–10 NYC addresses give the expected match or `null`, and no
  management office or nearby business matches by mistake.

### YELP-04 — Fetch rating and review excerpts · S
- Call `/businesses/{id}` to get `rating`, `review_count` and `url`.
- Call `/businesses/{id}/reviews` only if the plan includes it (a config flag). Skip it gracefully on
  `UNAUTHORIZED_API_KEY`.
- Normalize to `{ source: 'yelp', businessId, rating, ratingCount, url, reviews: [{ id, rating, text,
  author, authorUri, authorPhotoUri, publishedAt, url }], raw }`, the same shape as GMAPS-04.
- Add a Zod schema and capture fixtures.
- **Done when:** schema tests pass against the fixtures.

### YELP-05 — Storage with the 24-hour limit · M
- This ticket owns the review tables now. GMAPS-05 was changed to store only the Google place ID,
  because Google bans storing ratings and reviews. Create `building_reviews_summary` (`bbl`,
  `source`, `rating`, `rating_count`, `url`, `fetched_at`) and `building_reviews` (`bbl`, `source`,
  `source_review_id`, `rating`, `text`, `author`, `author_uri`, `published_at`, `fetched_at`) with
  `source = 'yelp'`.
- Purge Yelp rows whose `fetched_at` is older than 24 hours. Run the purge from
  `src/app/api/internal/cleanup` (the existing cron).
- Treat Yelp data older than 24 hours as missing, never as stale, and refetch it on demand.
- Add a script that deletes all Yelp content, for a Yelp removal request.
- **Done when:** a test shows that a 25-hour-old row is purged and never served.

### YELP-06 — Wire into ingest · S
- Register the fetcher next to `FETCHERS` in `lib/ingest.js`. Its freshness window is
  `min(fresh_for_ms, 24h)`.
- A Yelp failure or exhausted quota must not fail the NYC ingest.
- Add a `--no-yelp` CLI flag.
- **Done when:** `scripts/ingest.js <address>` stores Yelp data, and a second run makes no calls.

### YELP-07 — Expose to the app · S
- Return Yelp data from `src/app/api/buildings/[id]` as its own block. Never feed it to
  `src/lib/scoring` or show it inside a blended score.
- Exclude Yelp fields from anything passed to `src/lib/ai`, which `/api/advisor` uses, and from
  `/api/compare` rankings, which use scoring. Add a test that checks this.
- In the UI, show Yelp stars and logo, the review count next to the stars, a link to the Yelp page,
  and a "read more" link on each excerpt.
- **Done when:** a building page shows the Yelp block with attribution, and the AI-exclusion test
  passes.
