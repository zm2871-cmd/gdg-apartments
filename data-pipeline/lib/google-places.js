// Places API (New) client for the pipeline. Text Search only: Place Details runs live in the app (GMAPS-04).
const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const MAX_RETRIES = 3;
const TIMEOUT_MS = 30_000;

export async function searchText(query, { lat, lon, radius, includedType }, fieldMask) {
  // Google bills a request at its most expensive field, so a missing or "*" mask could bill at the top tier.
  if (!fieldMask || fieldMask.includes("*"))
    throw new Error("Google Places: an explicit field mask is required");
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Google Places: GOOGLE_MAPS_API_KEY is not set");
  const body = JSON.stringify({
    textQuery: query,
    pageSize: 5,
    includedType, // dropped from the JSON when undefined
    locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius } },
  });
  const label = `searchText "${query}"`; // the key lives in a header, so it can't leak into this
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(SEARCH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": fieldMask,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      // timeout or network failure
      if (attempt < MAX_RETRIES) {
        await backoff(attempt);
        continue;
      }
      throw new Error(`Google Places ${label}: ${err.message}`);
    }
    if (res.ok) return (await res.json()).places ?? []; // no match comes back as {}
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      await backoff(attempt);
      continue;
    }
    const text = await res.text().catch(() => "");
    throw new Error(`Google Places ${label}: HTTP ${res.status} ${text.slice(0, 300)}`);
  }
}

const backoff = (attempt) =>
  new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
