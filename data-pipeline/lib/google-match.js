import { searchText } from './google-places.js';

const MAX_DISTANCE_M = 50;
// Pro tier. location is used only to check distance and is never stored (Service Terms §14.3, ToS §3.2.3).
const MATCH_MASK = 'places.id,places.formattedAddress,places.location,places.types';

// Returns the Google place ID for a building, or null when it has no listing (most NYC buildings).
// `building` is { address, lat, lon }, e.g. a GeoSearch match ({ label, lat, lon }) mapped to address.
export async function matchPlace({ address, lat, lon }) {
  // Without a type filter, Text Search returns the bare address result (premise/subpremise), which never has reviews.
  // shortcut: apartment_building also returns apartment_complex listings, but may miss condo-only ones; add a second
  // call with includedType condominium_complex if real condos come back null.
  const places = await searchText(address, { lat, lon, radius: MAX_DISTANCE_M, includedType: 'apartment_building' }, MATCH_MASK);
  return pickPlace(places, { address, lat, lon });
}

const RECHECK_NO_MATCH_MS = 90 * 24 * 60 * 60 * 1000; // a building may get a Google listing later

/**
 * Finds and saves a building's place ID in google_places, during ingest. A building that already has an ID, or was
 * searched with no match in the last 90 days, is skipped. Never throws for a Google failure: it's recorded in
 * source_fetches (source 'google') so it can't fail the NYC ingest.
 * @param {{ bbl: string, address: string, lat: number, lon: number }} building  must already be in buildings
 * @returns {Promise<{ source: 'google', status: 'ok'|'skipped'|'failed', placeId?: string|null, error?: string }>}
 */
export async function syncGooglePlace(building, db) {
  const { bbl } = building;
  const { data: row, error } = await db.from('google_places').select('place_id, matched_at').eq('bbl', bbl).maybeSingle();
  if (error) throw new Error(`Reading google_places for ${bbl}: ${error.message}`);
  if (row && (row.place_id || Date.now() - new Date(row.matched_at) < RECHECK_NO_MATCH_MS)) {
    return { source: 'google', status: 'skipped', placeId: row.place_id };
  }

  const attemptedAt = new Date().toISOString();
  try {
    const placeId = await matchPlace(building);
    const saved = await db.from('google_places').upsert({ bbl, place_id: placeId, matched_at: attemptedAt });
    if (saved.error) throw new Error(`Saving google_places for ${bbl}: ${saved.error.message}`);
    await recordGoogleFetch(db, { bbl, last_attempt_at: attemptedAt, last_success_at: attemptedAt, last_error: null, row_count: placeId ? 1 : 0 });
    return { source: 'google', status: 'ok', placeId };
  } catch (err) {
    let message = err.message;
    try {
      await recordGoogleFetch(db, { bbl, last_attempt_at: attemptedAt, last_error: message });
    } catch (recordError) {
      message += `; also failed to record it: ${recordError.message}`;
    }
    return { source: 'google', status: 'failed', error: message };
  }
}

async function recordGoogleFetch(db, row) {
  const { error } = await db.from('source_fetches').upsert({ ...row, source: 'google' }, { onConflict: 'bbl,source' });
  if (error) throw new Error(error.message);
}

// Nearest candidate within 50 m whose house number matches the building's; null otherwise.
export function pickPlace(places, { address, lat, lon }) {
  const number = houseNumber(address);
  if (!number) return null;
  const hits = places
    .filter((p) => p.location && houseNumber(p.formattedAddress) === number)
    .map((p) => ({ id: p.id, d: distanceM(lat, lon, p.location.latitude, p.location.longitude) }))
    .filter((p) => p.d <= MAX_DISTANCE_M)
    .sort((a, b) => a.d - b.d);
  return hits[0]?.id ?? null;
}

// Leading house number of the first address part that starts with a digit: "Tower, 50-01 2nd St, ..." -> "50-01".
export function houseNumber(address) {
  for (const part of String(address ?? '').split(',')) {
    const m = part.trim().match(/^(\d+(?:-\d+)?[A-Z]?)\b/i);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

// Equirectangular approximation: well under 1% error at 50 m.
function distanceM(lat1, lon1, lat2, lon2) {
  const x = (lon2 - lon1) * Math.cos(((lat1 + lat2) / 2) * (Math.PI / 180));
  return Math.hypot(lat2 - lat1, x) * 111_320;
}
