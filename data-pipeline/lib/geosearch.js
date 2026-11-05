import { normalizeBbl } from './bbl.js';
import { geosearchSchema } from './schemas.js';

const GEOSEARCH_URL = 'https://geosearch.planninglabs.nyc/v2/autocomplete';

// Raw GeoSearch response (GeoJSON FeatureCollection).
export async function geosearch(text, size = 5) {
  const res = await fetch(`${GEOSEARCH_URL}?${new URLSearchParams({ text, size })}`, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`GeoSearch "${text}": HTTP ${res.status}`);
  return res.json();
}

// Top 5 matches as { label, bbl, bin, borough, lat, lon }; matches without a valid BBL are dropped,
// and alternate spellings of the same building ("1306 B'WAY", "1306 BWAY EAST") keep only the first.
export async function searchAddress(text) {
  const query = String(text ?? '').trim();
  if (!query) return [];
  const { features } = geosearchSchema.parse(await geosearch(query, 5));
  const seen = new Set();
  return features.flatMap(({ geometry, properties }) => {
    const pad = properties.addendum?.pad;
    const bbl = normalizeBbl(pad?.bbl);
    const key = `${bbl}|${pad?.bin}`;
    if (!bbl || seen.has(key)) return [];
    seen.add(key);
    const [lon, lat] = geometry.coordinates;
    return [{ label: properties.label, bbl, bin: pad.bin ?? null, borough: properties.borough ?? null, lat, lon }];
  });
}
