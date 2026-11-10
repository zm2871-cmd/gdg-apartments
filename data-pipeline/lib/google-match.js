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
