import { fetchIssues as fetchViolations } from './fetchers/hpd-violations.js';
import { fetchIssues as fetchComplaints } from './fetchers/hpd-complaints.js';
import { fetchIssues as fetchRodents } from './fetchers/rodent.js';
import { fetchIssues as fetchBedbugs } from './fetchers/bedbug.js';
import { fetchIssues as fetch311 } from './fetchers/311.js';
import { toIssueRow } from './issue.js';
import { buildingRefSchema } from './schemas.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const UPSERT_BATCH = 500;
const DELETE_BATCH = 100; // IDs go in the request URL; bedbug IDs are ~60 characters each
const READ_PAGE = 1000;   // Supabase returns at most 1,000 rows per request by default

export const FETCHERS = {
  hpd_violation: fetchViolations,
  hpd_complaint: fetchComplaints,
  rodent: fetchRodents,
  bedbug: fetchBedbugs,
  '311': fetch311,
};
// Explicit order: JavaScript lists integer-like keys such as '311' first in Object.keys.
const SOURCES = ['hpd_violation', 'hpd_complaint', 'rodent', 'bedbug', '311'];

async function storedIds(db, bbl, source) {
  const ids = [];
  for (let from = 0; ; from += READ_PAGE) {
    const { data, error } = await db.from('issues').select('source_id')
      .eq('bbl', bbl).eq('source', source).order('source_id').range(from, from + READ_PAGE - 1);
    if (error) throw new Error(`Reading ${source} rows for ${bbl}: ${error.message}`);
    ids.push(...data.map((r) => r.source_id));
    if (data.length < READ_PAGE) return ids;
  }
}

/** Deletes this BBL's stored rows for a source that the fetch didn't return. Returns a note when it skips. */
async function reconcile(db, bbl, source, issues, latestRecordAt) {
  const stored = await storedIds(db, bbl, source);

  // No rows at all came back (not even filtered ones) but we have history: likely an upstream glitch, so keep it.
  if (latestRecordAt === null && stored.length > 0) {
    return `skipped deletes: empty response with ${stored.length} stored rows`;
  }

  const returned = new Set(issues.map((i) => i.sourceId));
  const stale = stored.filter((id) => !returned.has(id));
  for (let i = 0; i < stale.length; i += DELETE_BATCH) {
    const { error } = await db.from('issues').delete()
      .eq('bbl', bbl).eq('source', source).in('source_id', stale.slice(i, i + DELETE_BATCH));
    if (error) throw new Error(`Deleting stale ${source} rows for ${bbl}: ${error.message}`);
  }
  return null;
}

async function saveIssues(db, bbl, source, issues) {
  const fetchedAt = new Date().toISOString(); // the column default only applies on insert
  const rows = issues.map((issue) => ({ ...toIssueRow(issue), fetched_at: fetchedAt }));
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await db.from('issues').upsert(batch, { onConflict: 'source,source_id' });
    if (error) throw new Error(`Saving ${source} rows ${i + 1}–${i + batch.length} for ${bbl}: ${error.message}`);
  }
  return rows.length;
}

async function recordFetch(db, row) {
  const { error } = await db.from('source_fetches').upsert(row, { onConflict: 'bbl,source' });
  if (error) throw new Error(`Recording ${row.source} fetch for ${row.bbl}: ${error.message}`);
}

/**
 * Fetches every source for a building and saves the results. Sources that succeeded in the last 24 hours
 * are skipped unless `force`; failed sources are retried on every run. The building must already be saved
 * in `buildings` (resolveBuilding). Returns one summary per source.
 * @param {import('./schemas.js').BuildingRef} building
 * @param {import('@supabase/supabase-js').SupabaseClient} db  a client with write access (secret key)
 * @returns {Promise<{ source: string, status: 'ok'|'skipped'|'failed', count?: number, note?: string, error?: string }[]>}
 */
export async function ingest(building, db, { force = false } = {}) {
  const { bbl } = buildingRefSchema.parse(building);

  const { data: fetches, error } = await db.from('source_fetches').select('source, last_success_at').eq('bbl', bbl);
  if (error) throw new Error(`Reading source_fetches for ${bbl}: ${error.message}`);
  const fresh = new Set(fetches.filter((f) => f.last_success_at && Date.now() - new Date(f.last_success_at) < DAY_MS).map((f) => f.source));

  const toRun = SOURCES.filter((source) => force || !fresh.has(source));
  const results = await Promise.allSettled(toRun.map((source) => FETCHERS[source](building)));

  const summary = SOURCES.filter((s) => !toRun.includes(s)).map((source) => ({ source, status: 'skipped' }));
  for (const [index, result] of results.entries()) {
    const source = toRun[index];
    const attemptedAt = new Date().toISOString();
    try {
      if (result.status === 'rejected') throw result.reason;
      const { issues, latestRecordAt } = result.value;
      const count = await saveIssues(db, bbl, source, issues);
      // 311 rows are shared with neighboring buildings, so they are never reconciled.
      const note = source === '311' ? null : await reconcile(db, bbl, source, issues, latestRecordAt);
      await recordFetch(db, {
        bbl, source, last_attempt_at: attemptedAt, last_success_at: attemptedAt,
        last_error: note, row_count: count, latest_record_at: latestRecordAt,
      });
      summary.push({ source, status: 'ok', count, ...(note && { note }) });
    } catch (err) {
      // A failed fetch or save deletes nothing and keeps last_success_at, so the source is retried next run.
      let message = err.message;
      try {
        await recordFetch(db, { bbl, source, last_attempt_at: attemptedAt, last_error: message });
      } catch (recordError) {
        message += `; also failed to record it: ${recordError.message}`;
      }
      summary.push({ source, status: 'failed', error: message });
    }
  }
  return summary.sort((a, b) => SOURCES.indexOf(a.source) - SOURCES.indexOf(b.source));
}
