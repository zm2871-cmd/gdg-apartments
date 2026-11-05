import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues as fetch311 } from '../lib/fetchers/311.js';
import { fetchIssues as fetchBedbugs } from '../lib/fetchers/bedbug.js';
import { fetchIssues as fetchComplaints } from '../lib/fetchers/hpd-complaints.js';
import { fetchIssues as fetchViolations } from '../lib/fetchers/hpd-violations.js';
import { fetchIssues as fetchRodents } from '../lib/fetchers/rodent.js';
import { ingest } from '../lib/ingest.js';

vi.mock('../lib/fetchers/311.js', () => ({ fetchIssues: vi.fn() }));
vi.mock('../lib/fetchers/bedbug.js', () => ({ fetchIssues: vi.fn() }));
vi.mock('../lib/fetchers/hpd-complaints.js', () => ({ fetchIssues: vi.fn() }));
vi.mock('../lib/fetchers/hpd-violations.js', () => ({ fetchIssues: vi.fn() }));
vi.mock('../lib/fetchers/rodent.js', () => ({ fetchIssues: vi.fn() }));

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const BBL = '5999999903'; // reserved fake BBL; other test files use …01 and …02
const NEIGHBOR = '5999999904'; // fake neighbor BBL for 311 rows
const PREFIX = 'test-data13-';
const building = { bbl: BBL, bin: '5999999', lat: 40.6, lon: -74.1 };
const fetchers = { hpd_violation: fetchViolations, hpd_complaint: fetchComplaints, rodent: fetchRodents, bedbug: fetchBedbugs, '311': fetch311 };

const issue = (source, id, fields = {}) => ({
  source, sourceId: `${PREFIX}${id}`, bbl: source === '311' ? NEIGHBOR : BBL, category: source === '311' ? 'noise' : 'repairs',
  severity: 1, status: 'open', observedAt: '2026-10-01T00:00:00', description: 'test', lat: 40.6, lon: -74.1, raw: {}, ...fields,
});
const result = (issues, latestRecordAt = issues.length ? '2026-10-01T00:00:00' : null) => ({ issues, latestRecordAt });

/** Sets what each fetcher returns on its next call; unlisted sources return one issue each. */
function mockFetchers(overrides = {}) {
  for (const [source, fn] of Object.entries(fetchers)) {
    vi.mocked(fn).mockReset();
    const value = overrides[source] ?? result([issue(source, `${source}-1`)]);
    if (value instanceof Error) vi.mocked(fn).mockRejectedValueOnce(value);
    else vi.mocked(fn).mockResolvedValueOnce(value);
  }
}

describe('ingest', () => {
  it('rejects an invalid building before touching the database', async () => {
    const db = { from: vi.fn() };
    await expect(ingest({ ...building, bbl: '0' }, db)).rejects.toThrow();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe.skipIf(!SUPABASE_URL)('ingest against the database', () => {
  let db;
  const cleanup = async () => {
    await db.from('issues').delete().like('source_id', `${PREFIX}%`);
    await db.from('buildings').delete().eq('bbl', BBL); // cascades to source_fetches
  };
  const stored = async (source) => {
    const { data, error } = await db.from('issues').select('source_id, status, bbl').eq('source', source).like('source_id', `${PREFIX}%`).order('source_id');
    if (error) throw error;
    return data;
  };
  const fetchRecord = async (source) => {
    const { data, error } = await db.from('source_fetches').select('*').eq('bbl', BBL).eq('source', source).maybeSingle();
    if (error) throw error;
    return data;
  };

  beforeAll(() => { db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY); });
  beforeEach(async () => {
    await cleanup();
    const { error } = await db.from('buildings').insert({ bbl: BBL, address: 'test', borough: 'test', geom: 'SRID=4326;POINT(-74.1 40.6)' });
    if (error) throw error;
  });
  afterAll(cleanup);

  it('saves every source and records each fetch', async () => {
    mockFetchers();
    const summary = await ingest(building, db);

    expect(summary.map((s) => [s.source, s.status, s.count])).toEqual([
      ['hpd_violation', 'ok', 1], ['hpd_complaint', 'ok', 1], ['rodent', 'ok', 1], ['bedbug', 'ok', 1], ['311', 'ok', 1],
    ]);
    for (const source of Object.keys(fetchers)) {
      expect(await stored(source)).toHaveLength(1);
      expect(await fetchRecord(source)).toMatchObject({ row_count: 1, last_error: null, latest_record_at: '2026-10-01T00:00:00' });
    }
    expect((await stored('311'))[0].bbl).toBe(NEIGHBOR);
  });

  it('fetches nothing on a second run within 24 hours, unless forced', async () => {
    mockFetchers();
    await ingest(building, db);

    mockFetchers();
    const summary = await ingest(building, db);
    expect(summary.every((s) => s.status === 'skipped')).toBe(true);
    for (const fn of Object.values(fetchers)) expect(fn).not.toHaveBeenCalled();

    mockFetchers();
    await ingest(building, db, { force: true });
    for (const fn of Object.values(fetchers)) expect(fn).toHaveBeenCalledTimes(1);
  });

  it('creates no duplicates on a re-run', async () => {
    const twoViolations = () => result([issue('hpd_violation', 'a'), issue('hpd_violation', 'b')]);
    mockFetchers({ hpd_violation: twoViolations() });
    await ingest(building, db);
    mockFetchers({ hpd_violation: twoViolations() });
    await ingest(building, db, { force: true });

    expect((await stored('hpd_violation')).map((r) => r.source_id)).toEqual([`${PREFIX}a`, `${PREFIX}b`]);
  });

  it('updates a status change in place', async () => {
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'v', { status: 'open' })]) });
    await ingest(building, db);
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'v', { status: 'closed' })]) });
    await ingest(building, db, { force: true });

    expect(await stored('hpd_violation')).toEqual([{ source_id: `${PREFIX}v`, status: 'closed', bbl: BBL }]);
  });

  it('deletes nothing and keeps last_success_at when a source fails', async () => {
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'a'), issue('hpd_violation', 'b')]) });
    await ingest(building, db);
    const before = await fetchRecord('hpd_violation');

    mockFetchers({ hpd_violation: new Error('Socrata wvxf-dwi5: HTTP 503') });
    const summary = await ingest(building, db, { force: true });

    expect(summary.find((s) => s.source === 'hpd_violation')).toMatchObject({ status: 'failed', error: 'Socrata wvxf-dwi5: HTTP 503' });
    expect(await stored('hpd_violation')).toHaveLength(2);
    const after = await fetchRecord('hpd_violation');
    expect(after.last_error).toBe('Socrata wvxf-dwi5: HTTP 503');
    expect(after.last_success_at).toBe(before.last_success_at);
    expect(new Date(after.last_attempt_at) > new Date(before.last_attempt_at)).toBe(true);
  });

  it('still saves the other sources when one fails, and retries only the failed one', async () => {
    mockFetchers({ hpd_complaint: new Error('Socrata ygpa-z7cr: HTTP 500') });
    const summary = await ingest(building, db);

    expect(summary.filter((s) => s.status === 'ok')).toHaveLength(4);
    expect(await stored('hpd_complaint')).toEqual([]);
    expect(await fetchRecord('hpd_complaint')).toMatchObject({ last_success_at: null, last_error: 'Socrata ygpa-z7cr: HTTP 500' });

    mockFetchers();
    const retry = await ingest(building, db);
    expect(retry.find((s) => s.source === 'hpd_complaint').status).toBe('ok');
    expect(retry.filter((s) => s.status === 'skipped')).toHaveLength(4);
    expect(fetchComplaints).toHaveBeenCalledTimes(1);
    expect(fetchViolations).not.toHaveBeenCalled();
  });

  it('treats a save error as a failed source without stopping the others', async () => {
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'bad', { category: 'mold' })]) });
    const summary = await ingest(building, db);

    expect(summary.find((s) => s.source === 'hpd_violation').status).toBe('failed');
    expect(summary.filter((s) => s.status === 'ok')).toHaveLength(4);
    expect((await fetchRecord('hpd_violation')).last_success_at).toBeNull();
  });

  it('deletes stale rows for BBL-scoped sources', async () => {
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'keep'), issue('hpd_violation', 'gone')]) });
    await ingest(building, db);
    mockFetchers({ hpd_violation: result([issue('hpd_violation', 'keep')]) });
    await ingest(building, db, { force: true });

    expect((await stored('hpd_violation')).map((r) => r.source_id)).toEqual([`${PREFIX}keep`]);
  });

  it('never deletes 311 rows', async () => {
    mockFetchers({ '311': result([issue('311', 'n1'), issue('311', 'n2')]) });
    await ingest(building, db);
    mockFetchers({ '311': result([issue('311', 'n1')]) });
    await ingest(building, db, { force: true });

    expect(await stored('311')).toHaveLength(2);
  });

  it('skips deletes when a source returns no rows at all but rows are stored', async () => {
    mockFetchers({ bedbug: result([issue('bedbug', 'b1'), issue('bedbug', 'b2')]) });
    await ingest(building, db);
    mockFetchers({ bedbug: result([], null) });
    const summary = await ingest(building, db, { force: true });

    expect(summary.find((s) => s.source === 'bedbug')).toMatchObject({ status: 'ok', note: 'skipped deletes: empty response with 2 stored rows' });
    expect(await stored('bedbug')).toHaveLength(2);
    const record = await fetchRecord('bedbug');
    expect(record.last_error).toBe('skipped deletes: empty response with 2 stored rows');
    expect(record.last_success_at).not.toBeNull();
  });

  it('deletes stale rows when rows came back but all were filtered out', async () => {
    mockFetchers({ bedbug: result([issue('bedbug', 'b1')]) });
    await ingest(building, db);
    mockFetchers({ bedbug: result([], '2026-12-15T00:00:00') }); // e.g. a filing that reported zero infested units
    await ingest(building, db, { force: true });

    expect(await stored('bedbug')).toEqual([]);
  });

  it('deletes stale bedbug rows with full-length IDs in several requests', async () => {
    // Real bedbug IDs are building_id|registration_id|filing_date|filling_period_end_date (~65 characters).
    const bedbugId = (i) => `${800000 + i}|${370000 + i}|2025-12-15T00:00:00.000|2025-10-31T00:00:00.000`;
    const many = Array.from({ length: 250 }, (_, i) => issue('bedbug', bedbugId(i)));
    mockFetchers({ bedbug: result(many) });
    expect((await ingest(building, db)).find((s) => s.source === 'bedbug').count).toBe(250);

    mockFetchers({ bedbug: result([many[0]]) }); // 249 stale: 3 delete requests of up to 100 IDs
    expect((await ingest(building, db, { force: true })).find((s) => s.source === 'bedbug').status).toBe('ok');
    expect((await stored('bedbug')).map((r) => r.source_id)).toEqual([`${PREFIX}${bedbugId(0)}`]);
  }, 60_000);

  it('reconciles past Supabase’s 1,000-row read limit', async () => {
    const many = Array.from({ length: 1200 }, (_, i) => issue('hpd_violation', `m${String(i).padStart(4, '0')}`));
    mockFetchers({ hpd_violation: result(many) });
    expect((await ingest(building, db)).find((s) => s.source === 'hpd_violation').count).toBe(1200);

    mockFetchers({ hpd_violation: result([many[0]]) });
    await ingest(building, db, { force: true });
    expect(await stored('hpd_violation')).toHaveLength(1);
  }, 60_000);
});
