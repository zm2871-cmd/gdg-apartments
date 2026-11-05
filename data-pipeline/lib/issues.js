import { normalizeBbl } from './bbl.js';
import { collapse } from './collapse.js';
import { fromEwkbHex, fromIssueRow } from './issue.js';
import { cutoff, fresh_for_ms, three_one_one_search_radius, time_windows } from './sources.js';

const BBL_SOURCES = ['hpd_violation', 'hpd_complaint', 'rodent', 'bedbug'];
const ALL_SOURCES = [...BBL_SOURCES, '311'];
const PAGE = 1000; // Supabase's per-request row cap, which also applies to issues_near

async function readAll(makeQuery, what) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading ${what}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

/** ok | stale (last success over 24 hours ago) | failed (latest attempt errored) | missing (never fetched). */
function sourceStatus(source, record) {
  if (!record) return { source, status: 'missing' };
  const lastSuccessAt = record.last_success_at;
  // A success can also carry a note in last_error ("skipped deletes …"); it only counts as a failure
  // when the latest attempt came after the latest success.
  if (record.last_error && (!lastSuccessAt || new Date(record.last_attempt_at) > new Date(lastSuccessAt))) {
    return { source, status: 'failed', error: record.last_error, lastSuccessAt };
  }
  const status = Date.now() - new Date(lastSuccessAt) > fresh_for_ms ? 'stale' : 'ok';
  return { source, status, lastSuccessAt, ...(record.last_error && { note: record.last_error }) };
}

/**
 * Which numbers the report should lead with (decision-lot-vs-building.md, question 2).
 * - The searched building's own, when HPD has records for it, or when HPD has no records anywhere on the lot.
 * - The whole lot, with a note, when HPD files the lot's records under other buildings only.
 */
function headlineFor(matched, lotHpdIssues) {
  if (matched || lotHpdIssues.length === 0) return { headline: 'building', note: null };
  const others = new Set(lotHpdIssues.map((issue) => String(issue.raw?.bin)).filter((b) => b !== 'undefined')).size;
  return {
    headline: 'lot',
    note: `The city files this lot's housing records under ${others === 1 ? 'another building' : `${others} other buildings`} `
      + 'on the same lot, so these numbers cover the whole lot.',
  };
}

/**
 * Reads a building's saved issues. Read only: no database rows change.
 *
 * `issues` covers the whole lot (BBL), which is what grading uses: PLUTO's unit counts are per lot.
 * With a `bin`, `building` also gives the searched building's own issues (decision-lot-vs-building.md,
 * option 2). `building.matched` is false when no HPD violation or complaint on the lot carries that BIN — e.g.
 * 281 Marcus Garvey Blvd, whose GeoSearch BIN has no HPD records while the lot's apartments are filed under
 * Gates Avenue. A genuinely clean building on a multi-building lot also has no HPD records, so matched=false
 * means "can't tell this building apart", not "this building is clean".
 * @param {string} bbl
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ bin?: string | null }} [options]
 * @returns {Promise<{
 *   issues: import('./schemas.js').Issue[],
 *   building?: { bin: string, matched: boolean, issues: import('./schemas.js').Issue[], headline: 'building'|'lot', note: string|null },
 *   noise: (import('./schemas.js').Issue & { distanceM: number, sourceIds: string[], count: number })[],
 *   sources: { source: string, status: 'ok'|'stale'|'failed'|'missing', lastSuccessAt?: string, error?: string, note?: string }[],
 * }>}
 */
export async function getBuildingIssues(bbl, db, { bin } = {}) {
  const normalized = normalizeBbl(bbl);
  if (!normalized) throw new Error(`Invalid BBL: ${JSON.stringify(bbl)}`);

  const { data: building, error } = await db.from('buildings').select('geom').eq('bbl', normalized).maybeSingle();
  if (error) throw new Error(`Reading building ${normalized}: ${error.message}`);
  if (!building) throw new Error(`No saved building for BBL ${normalized}`);
  const { lat, lon } = fromEwkbHex(building.geom);

  const [issueRows, noiseRows, fetchRows] = await Promise.all([
    readAll(() => db.from('issues').select('*').eq('bbl', normalized).in('source', BBL_SOURCES)
      .order('source').order('source_id'), `issues for ${normalized}`),
    // issues_near returns every source in the radius (including this and neighboring buildings' HPD rows),
    // so keep 311 only; those are counted once each through the building query above.
    readAll(() => db.rpc('issues_near', {
      lat, lon, radius_m: three_one_one_search_radius.meters, since: cutoff(time_windows.three_one_one_requests.months),
    }).eq('source', '311').order('distance_m').order('source_id'), `311 rows near ${normalized}`),
    db.from('source_fetches').select('*').eq('bbl', normalized).then(({ data, error: fetchError }) => {
      if (fetchError) throw new Error(`Reading source_fetches for ${normalized}: ${fetchError.message}`);
      return data;
    }),
  ]);

  const records = new Map(fetchRows.map((r) => [r.source, r]));
  const issues = issueRows.map(fromIssueRow);
  // Every HPD, rodent and bedbug row carries its building's BIN in raw.bin.
  const own = bin ? issues.filter((issue) => issue.raw?.bin != null && String(issue.raw.bin) === String(bin)) : null;
  // matched means HPD knows this building. Rodent inspections alone don't count: at 281 Marcus Garvey Blvd the
  // searched BIN has 2 rodent rows but no HPD records, while the lot's apartments have hundreds of violations.
  const isHpd = (issue) => issue.source === 'hpd_violation' || issue.source === 'hpd_complaint';
  const matched = own?.some(isHpd);
  return {
    issues,
    ...(own && { building: { bin: String(bin), matched, issues: own, ...headlineFor(matched, issues.filter(isHpd)) } }),
    noise: collapse(noiseRows.map(fromIssueRow)),
    sources: ALL_SOURCES.map((source) => sourceStatus(source, records.get(source))),
  };
}
