// Fetches every source for one address and saves it to Supabase.
// Usage: node --env-file=.env scripts/ingest.js "161 Newel St" [--force]
import { createClient } from '@supabase/supabase-js';
import { resolveBuilding } from '../lib/building.js';
import { searchAddress } from '../lib/geosearch.js';
import { ingest } from '../lib/ingest.js';

const args = process.argv.slice(2);
const force = args.includes('--force');
const address = args.filter((a) => a !== '--force').join(' ').trim();
if (!address) {
  console.error('Usage: node --env-file=.env scripts/ingest.js "<address>" [--force]');
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
for (const { source, status, count, note, error } of summary) {
  const detail = status === 'ok' ? `${count} issues${note ? `  (${note})` : ''}`
    : status === 'skipped' ? 'fetched in the last 24 hours'
    : error;
  console.log(`  ${source.padEnd(14)} ${status.padEnd(8)} ${detail}`);
}
console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
if (summary.some((s) => s.status === 'failed')) process.exitCode = 1;
