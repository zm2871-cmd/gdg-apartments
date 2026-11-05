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
 * Reads a building's saved issues. Read only: no database rows change.
 * @param {string} bbl
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {Promise<{
 *   issues: import('./schemas.js').Issue[],
 *   noise: (import('./schemas.js').Issue & { distanceM: number, sourceIds: string[], count: number })[],
 *   sources: { source: string, status: 'ok'|'stale'|'failed'|'missing', lastSuccessAt?: string, error?: string, note?: string }[],
 * }>}
 */
export async function getBuildingIssues(bbl, db) {
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
  return {
    issues: issueRows.map(fromIssueRow),
    noise: collapse(noiseRows.map(fromIssueRow)),
    sources: ALL_SOURCES.map((source) => sourceStatus(source, records.get(source))),
  };
}
