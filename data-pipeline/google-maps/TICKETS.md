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
- Call Text Search with the building's address as `textQuery`, a circle `locationBias` of about
  50 m at the building's lat/lon, `pageSize: 5`, and the cheap mask
  `places.id,places.formattedAddress,places.location,places.types`.
- Accept a candidate only if it is within about 50 m and its street number matches. Prefer the types
  `apartment_building`, `apartment_complex`, `condominium_complex` and `premise`. Otherwise return
  `null`, because many buildings have no Google listing.
- Store `google_place_id` on the building. Place IDs can be kept indefinitely. Re-match only when the
  ID is missing or Details returns `NOT_FOUND`.
- **Done when:** fixtures of 5–10 real NYC addresses give the expected match or `null`, and there
  are no false matches to nearby businesses.

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
- A place with no rating returns `rating: null, reviews: []`. A `NOT_FOUND` clears
  `google_place_id` so the next ingest re-matches. Any other failure returns `null` and is logged,
  never thrown to the page.
- **Done when:** unit tests with mocked `fetch` cover a full place, an empty place, `NOT_FOUND` and a
  5xx.

### GMAPS-05 — Store the place ID only · S
- Add a migration with `buildings.google_place_id text` and `buildings.google_matched_at
  timestamptz`. The timestamp is our own data. It records "checked, no listing" so a building
  without a match isn't searched again on every run.
- Store nothing else from Google: no rating, review or coordinate columns. Google rows never go in
  the shared review tables. YELP-05 owns those tables now.
- **Done when:** the migration applies locally, and a check confirms no Google field other than the
  ID exists in the schema.

### GMAPS-06 — Match place IDs during ingest · S
- Ingest runs only GMAPS-03 (Text Search, Pro tier). It never calls Details. Run the match when
  `google_place_id` is null and `google_matched_at` is missing or older than 90 days.
- A Google failure must not fail the NYC open-data ingest. Record it in `source_fetches` as a failed
  run.
- Add `--no-google` to `scripts/ingest.js` for cheap local runs.
- **Done when:** `scripts/ingest.js <address>` stores a place ID or a "no match" timestamp, and a
  second run makes no Google calls.

### GMAPS-07 — Show Google reviews on the building page · M
- Add `src/app/api/buildings/[id]/google/route.ts`. It calls `guard(req)`, looks up the building's
  `google_place_id` and returns `getGoogleReviews()`. Set `export const dynamic = 'force-dynamic'`
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
