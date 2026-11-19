// Adds every active building in HPD's buildings list to `buildings`, one row per lot (BBL), with location,
// unit count and year built from PLUTO. Issues are not loaded: ingest fetches them per building on lookup.
// Existing rows are left as they are, so it's safe to re-run and won't overwrite buildings added by ingest.
// Usage: node --env-file=.env scripts/load-buildings.js
import { createClient } from '@supabase/supabase-js';
import { bblFromParts, normalizeBbl } from '../lib/bbl.js';
import { toEwkt } from '../lib/issue.js';
import { querySocrata } from '../lib/socrata.js';
import { dataset_ids } from '../lib/sources.js';

const HPD_BUILDINGS = 'kj4p-ruqc'; // Buildings Subject to HPD Jurisdiction
const BOROUGHS = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' }; // GeoSearch's spelling
const BATCH = 1000;
const toInt = (value) => (value == null ? null : Math.trunc(Number(value)));

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (run with --env-file=.env).');
  process.exit(2);
}
const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);

console.log('Reading HPD buildings…');
const hpdRows = await querySocrata(HPD_BUILDINGS, {
  select: 'boroid, block, lot, bin, housenumber, streetname',
  where: "recordstatus = 'Active' AND lifecycle = 'Building'",
  order: ':id',
});
const lots = new Map(); // bbl -> the lot's first HPD building; a lot with several buildings keeps one BIN and address
for (const r of hpdRows) {
  const bbl = bblFromParts(r.boroid, r.block, r.lot);
  if (bbl && !lots.has(bbl)) lots.set(bbl, r);
}
console.log(`  ${hpdRows.length} buildings on ${lots.size} lots`);

console.log('Reading PLUTO (about 860 pages)…');
const plutoRows = await querySocrata(dataset_ids.pluto, {
  select: 'bbl, latitude, longitude, unitsres, yearbuilt',
  where: 'latitude IS NOT NULL',
  order: ':id',
});
const pluto = new Map(plutoRows.map((p) => [normalizeBbl(p.bbl), p]));

const rows = [];
let noLocation = 0;
for (const [bbl, b] of lots) {
  const p = pluto.get(bbl);
  const geom = toEwkt(p?.latitude, p?.longitude);
  if (!geom) { noLocation++; continue; } // geom is required; ingest adds these if someone searches for them
  rows.push({
    bbl,
    bin: b.bin ?? null,
    address: [b.housenumber, b.streetname].filter(Boolean).join(' '),
    borough: BOROUGHS[b.boroid],
    geom,
    units_res: toInt(p.unitsres),
    year_built: toInt(p.yearbuilt) || null, // PLUTO uses 0 for unknown
  });
}
console.log(`  ${rows.length} lots to save, ${noLocation} skipped with no PLUTO location`);

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await db.from('buildings').upsert(batch, { onConflict: 'bbl', ignoreDuplicates: true });
  if (error) throw new Error(`Saving buildings ${i + 1}–${i + batch.length}: ${error.message}`);
  if ((i / BATCH) % 25 === 0) console.log(`  saved ${i + batch.length}/${rows.length}`);
}
console.log('Done.');
