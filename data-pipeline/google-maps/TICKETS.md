# Google Maps (Places API New) — Tickets

Branch: `data-google-maps` · Folder: `data-pipeline/google-maps/`

Goal: for a resolved building (`BuildingRef` + its address), find the Google place and store its
rating, review count and up to 5 reviews.

## API facts these tickets rely on

Source: developers.google.com/maps/documentation/places/web-service (op-overview, text-search,
place-details, data-fields, usage-and-billing, policies), read 2026-11-06.

- **Text Search:** `POST https://places.googleapis.com/v1/places:searchText`.
  Body `{ textQuery, pageSize, locationBias: { circle: { center: { latitude, longitude }, radius } } }`.
  The radius is in meters (0–50000). Do not put raw lat/lon in `textQuery`. Field names need the
  `places.` prefix, e.g. `places.id,places.rating`.
- **Place Details:** `GET https://places.googleapis.com/v1/places/{PLACE_ID}`. Field names have no
  prefix (`rating,userRatingCount,reviews`). It costs less than search once the place ID is known.
- **Headers:** `X-Goog-Api-Key: <key>` and `X-Goog-FieldMask: <fields>`. A request without a field
  mask returns an error. Don't use `*` in production.
- **Fields:** `rating` is 1.0–5.0. `userRatingCount` is the total review count. `reviews` holds up to
  **5** Review objects, ordered by relevance. Each has `name`, `rating`, `text{text,languageCode}`,
  `originalText`, `authorAttribution{displayName,uri,photoUri}`, `relativePublishTimeDescription`,
  `publishTime` and `googleMapsUri`. Check `publishTime` against the REST reference before relying
  on it.
- **Billing:** each request is billed at the highest SKU among its fields.
  - `id`: Essentials (IDs only).
  - `formattedAddress`, `location`, `types`: Pro in Text Search, Essentials in Place Details.
  - `displayName`, `googleMapsUri`: Pro.
  - `rating`, `userRatingCount`: Enterprise.
  - `reviews`: Enterprise + Atmosphere, the most expensive tier.
- **Quotas:** per-minute limits apply per method, per project. Set caps in Cloud Console under
  Google Maps Platform > Quotas.
- **Storage (confirmed, GMAPS-01):** Terms of Service §3.2.3(b) bans caching Google Maps Content
  unless the Service Specific Terms allow it, and §3.2.3(a)(iii) bans "copy and save ... user
  reviews". The only Places allowance is Service Terms §14.3: **latitude/longitude for up to 30
  days**. So:
  - `google_place_id`: may be stored indefinitely (Places API policies, "Exceptions from caching
    restrictions"). Google's recommended pattern is to store the place ID and fetch fresh details
    when a user views the place.
  - `location`: at most 30 days. Simplest is to use it during matching and never store it.
  - `rating`, `userRatingCount`, `reviews`, `googleMapsUri`: **0 days**. Fetch live per page view
    and never write them to the database.
- **Scoring (confirmed, GMAPS-01):** §3.2.3(c) bans creating content based on Google Maps Content.
  Google ratings must **not** feed `src/lib/scoring` or any stored score, index or ranking.
  §3.2.3(c)(iv) also bans using Places lat/lng for point-in-polygon analysis, so don't resolve a
  BBL from Google's coordinates.
- **Map (confirmed, GMAPS-01):** §3.2.3(e) bans using Places content "with or near a non-Google Map",
  including displaying Places content on one. Service Terms §14.2 says the same. `BuildingMap.tsx` is
  MapLibre, so Google content must not be on the same screen as it. §14.1 allows showing it with no
  map.
- **Integrity:** §3.2.3(g) bans modifying search results. Show ratings and reviews as Google returns
  them, with no editing, filtering or re-ranking.
- **Open risk:** §3.2.3(d)(iii) bans using Core Services "in a listings or directory service". A
  building-lookup site could be read as one. Ask Google sales or a lawyer before launch.
- **Display (Places API policies, "Photos and reviews"):**
  - Required: credit each review's author with `authorAttribution` (avatar, name, profile link)
    placed next to the review. If space is tight, the avatar alone is the minimum.
  - Required: a link from each review to its own `googleMapsUri`.
  - Required: a notice saying how reviews are ordered and filtered. The API default is "by
    relevance", and §3.2.3(g) means we never re-filter.
  - Recommended: `relativePublishTimeDescription` ("2 days ago"), a report link from
    `flagContentUri`, a "translated" note with `originalText`, and a notice that reviews aren't
    verified by Google, linking to Google's user-generated content policy.
  - The France `visitDate` rule doesn't apply to NYC. We don't request AI summaries, so those rules
    don't apply either.
  - Field mask for GMAPS-04: `id,rating,userRatingCount,reviews,googleMapsUri`. Each review object
    already contains `authorAttribution`, `googleMapsUri`, `flagContentUri`,
    `relativePublishTimeDescription` and `originalText`.

---

### GMAPS-01 — Confirm terms and set up the key · S
**Status: done.** The terms are recorded in API facts above. A Text Search curl with the key
returned a place. The key is in `data-pipeline/.env`, the root `.env.local` and Vercel, and the
quota caps and billing alert are set. GMAPS-04 to GMAPS-07 were rewritten to fetch live.
- Read the Maps Service Terms (cloud.google.com/maps-platform/terms/maps-service-terms). Write down
  how long `rating`, `userRatingCount` and `reviews` may be stored. Check whether NYC apartment
  ratings can feed a building score.
- Create a Cloud project, enable Places API (New), and create an API key limited to that API.
- Set a daily quota cap and a billing alert, because `reviews` uses the top SKU.
- Add `GOOGLE_MAPS_API_KEY` to `.env` and the Vercel env. Never commit the key.
- **Done when:** the storage limits are written in this file, and a `curl` Text Search with the key
  returns a place.

### GMAPS-02 — Places client · S
- Add `lib/google-places.js` with `searchText(query, { lat, lon, radius }, fieldMask)`. Use
  built-in `fetch` and follow the error handling in `lib/socrata.js`. Place Details isn't needed
  here, because it runs live in the app (GMAPS-04).
- A field mask is required on every call. Throw when it is missing so a forgotten mask can't bill at
  the wrong tier.
- Retry 429 and 5xx with backoff. Fail fast on 400 and 403.
- **Done when:** unit tests with mocked `fetch` cover success, 429 retry, 403 and a missing mask.

### GMAPS-03 — Match a building to a place ID · M
**Status: done.** `lib/google-match.js` exports `matchPlace({ address, lat, lon })`, which returns a
place ID or `null`.
- It calls Text Search with the GeoSearch label, `includedType: 'apartment_building'`, a 50 m
  `locationBias` and the mask `places.id,places.formattedAddress,places.location,places.types`.
- The type filter is required. Live tests on 2026-11-10 showed that an unfiltered search returns
  only the bare address result (`premise`/`subpremise`), which never has reviews.
- It accepts the nearest candidate within 50 m whose house number matches. Otherwise it returns
  `null`. Most buildings have no listing: 6 of the 9 test addresses had none.
- Storing the ID moved to GMAPS-05 and GMAPS-06.
- **Fixtures:** real Google responses are not saved, because §3.2.3(a) bans storing places
  information. Unit tests use hand-written candidates modeled on the live results, and
  `scripts/check-google-match.js` re-runs 9 real addresses live: 3 matches, plus near-misses such as
  165 vs 160 W 66th St. All pass.
- **Known gap:** condo-only listings (`condominium_complex`) may be missed. See the `shortcut:`
  comment in the code.

### GMAPS-04 — Live Place Details in the app · S
- Add `src/lib/google.ts` with `getGoogleReviews(placeId)`. The Next app doesn't import
  `data-pipeline/`, so this is the only Details call. GMAPS-02's client stays pipeline-only, for
  Text Search.
- Call `GET /v1/places/{id}` with the mask `id,rating,userRatingCount,reviews,googleMapsUri` and
  pass `cache: 'no-store'`. Next's fetch cache would otherwise store Google content, which is
  banned (see API facts, Storage).
- Validate with Zod and return `{ placeId, rating, ratingCount, url, reviews: [{ rating, text,
  originalText, translated, author, authorUri, authorPhotoUri, relativeTime, url, flagUrl }] }`.
  Keep Google's review order. Don't return `raw`.
- A place with no rating returns `rating: null, reviews: []`. A `NOT_FOUND` (HTTP 404)
  returns `'not_found'`, and the caller deletes the `google_places` row so the next ingest re-matches. Any other failure returns `null` and is logged,
  never thrown to the page.
- **Done when:** unit tests with mocked `fetch` cover a full place, an empty place, `NOT_FOUND` and a
  5xx.
- **Status: done.** `getGoogleReviews()` returns the reviews, `'not_found'` or `null`. It doesn't
  touch the database: on `'not_found'`, the GMAPS-07 route deletes the `google_places` row. Field
  names were checked against a live response on 2026-11-10, and `tests/unit/google.test.ts` (9
  tests) uses hand-written data, not saved Google content.

### GMAPS-05 — Store the place ID only · S
- Add a migration with a table `google_places`: `bbl` (primary key, foreign key to `buildings`,
  `on delete cascade`), `place_id text` (null means searched, no listing) and `matched_at
  timestamptz`.
- It's a separate table, so `resolveBuilding`'s upsert of `buildings` can never wipe it. RLS is on
  with no policy, so only the secret key can access it.
- Store nothing else from Google: no rating, review or coordinate columns. Google rows never go in
  the shared review tables. YELP-05 owns those tables now.
- **Done when:** the migration is pushed to the hosted project and `tests/schema.test.js` passes.

### GMAPS-06 — Match place IDs during ingest · S
- Ingest runs only GMAPS-03 (Text Search, Pro tier). It never calls Details. Run the match when the
  building has no `google_places` row, or its `place_id` is null and `matched_at` is older than 90
  days.
- A Google failure must not fail the NYC open-data ingest. Record it in `source_fetches` as a failed
  run.
- Add `--no-google` to `scripts/ingest.js` for cheap local runs.
- **Done when:** `scripts/ingest.js <address>` stores a place ID or a "no match" timestamp, and a
  second run makes no Google calls.
- **Status: done.** `syncGooglePlace()` in `lib/google-match.js` is called from `scripts/ingest.js`
  after `ingest()`, so the NYC sources never wait on Google. `--force` doesn't re-match: an ID
  stays until GMAPS-04 deletes it on `NOT_FOUND`. Live check: 1 Blue Slip matched, and the second
  run skipped Google.

### GMAPS-07 — Show Google reviews on the building page · M
- Add `src/app/api/buildings/[id]/google/route.ts`. It calls `guard(req)`, looks up the building's
  `google_places.place_id` and returns `getGoogleReviews()`. Set `export const dynamic = 'force-dynamic'`
  and send `Cache-Control: no-store`. It stays separate from `/api/buildings/[id]` so a slow or
  failing Google call never blocks the report.
- Load it only when the user opens a "Google reviews" tab or section. Every view is an Enterprise +
  Atmosphere call, so don't fetch on page load.
- Keep that view off any screen with `BuildingMap` on it, because of §3.2.3(e).
- Follow the Display rules in API facts: author attribution, a per-review Google Maps link, the
  notice "Sorted by relevance by Google", a report link, a translated label and the
  not-verified-by-Google notice.
- Google data must never reach `src/lib/scoring`, `saved`, `compare` or the `advisor` prompt,
  because of §3.2.3(a) and (c).
- **Done when:** a matched building shows the rating, count and reviews with every required element.
  An unmatched building shows "No Google listing", the map isn't visible alongside it, and the
  network tab shows no Google call until the tab is opened.
