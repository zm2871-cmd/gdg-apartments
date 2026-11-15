// Fetches every source for one address and saves it to Supabase.
// Usage: node --env-file=.env scripts/ingest.js "161 Newel St" [--force] [--no-google]
// --no-google skips the Google place-ID match (a billed Text Search) for cheap local runs.
import { createClient } from '@supabase/supabase-js';
import { resolveBuilding } from '../lib/building.js';
import { searchAddress } from '../lib/geosearch.js';
import { syncGooglePlace } from '../lib/google-match.js';
import { ingest } from '../lib/ingest.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const google = !args.includes('--no-google');
const address = args.filter((a) => a !== '--force' && a !== '--no-google').join(' ').trim();
if (!address) {
  console.error('Usage: node --env-file=.env scripts/ingest.js "<address>" [--force] [--no-google]');
  process.exit(2);
}

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set (run with --env-file=.env).');
  process.exit(2);
}

const [match] = await searchAddress(address);
if (!match) {
  console.error(`No building found for "${address}".`);
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
await resolveBuilding(match, db);
console.log(`${match.label}  BBL ${match.bbl}  BIN ${match.bin ?? '-'}${force ? '  (forced)' : ''}`);

const started = Date.now();
const summary = await ingest({ bbl: match.bbl, bin: match.bin, lat: match.lat, lon: match.lon }, db, { force });
if (google) {
  const g = await syncGooglePlace({ bbl: match.bbl, address: match.label, lat: match.lat, lon: match.lon }, db);
  summary.push({ ...g, note: g.placeId ? 'listing found' : 'no listing' });
}
for (const { source, status, count, fetchMs, note, error } of summary) {
  const detail = source === 'google' && status !== 'failed' ? `${note}${status === 'skipped' ? ' (already searched)' : ''}`
    : status === 'ok' ? `${count} issues${note ? `  (${note})` : ''}`
    : status === 'skipped' ? 'fetched in the last 24 hours'
    : error;
  const time = fetchMs == null ? '' : `${(fetchMs / 1000).toFixed(1)}s`;
  console.log(`  ${source.padEnd(14)} ${status.padEnd(8)} ${time.padStart(6)}  ${detail}`);
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (summary.some((s) => s.status === 'failed')) process.exitCode = 1;
