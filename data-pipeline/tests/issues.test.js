import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromEwkbHex } from '../lib/issue.js';
import { getBuildingIssues } from '../lib/issues.js';

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const BBL = '5999999905';      // reserved fake BBL; other test files use …01 to …04
const NEIGHBOR = '5999999906';
const PREFIX = 'test-data14-';
const LAT = 40.5, LON = -74.2; // away from the other test files' fake points
const point = (lat = LAT, lon = LON) => `SRID=4326;POINT(${lon} ${lat})`;
const recent = (hhmm, daysAgo = 3) => {
  const day = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
  return `${day}T${hhmm}:00`;
};

const row = (source, id, fields = {}) => ({
  source, source_id: `${PREFIX}${id}`, bbl: BBL, category: source === '311' ? 'noise' : 'repairs', severity: 1,
  status: 'open', observed_at: recent('12:00'), description: 'test', geom: null,
  raw: source === '311' ? { complaint_type: 'Noise - Residential' } : {}, ...fields,
});

describe('fromEwkbHex', () => {
  it('decodes a point as Supabase returns it', () => {
    // 161 Newel St, read back from the buildings table
    expect(fromEwkbHex('0101000020E6100000D386C3D2C07C52C0F8174163265D4440')).toEqual({ lon: -73.949269, lat: 40.727734 });
  });

  it('throws on something that is not a point', () => {
    expect(() => fromEwkbHex('0102000020E6100000')).toThrow(/Unexpected geom/);
  });
});

describe('getBuildingIssues', () => {
  it('rejects an invalid BBL before touching the database', async () => {
    const db = { from: vi.fn(), rpc: vi.fn() };
    await expect(getBuildingIssues('0', db)).rejects.toThrow(/Invalid BBL/);
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe.skipIf(!SUPABASE_URL)('getBuildingIssues against the database', () => {
  let db;
  const insert = async (table, rows) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from(table).insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  };
  const fetchRecord = (source, fields) => ({ bbl: BBL, source, last_attempt_at: new Date().toISOString(), ...fields });
  const cleanup = async () => {
    await db.from('issues').delete().like('source_id', `${PREFIX}%`);
    await db.from('buildings').delete().eq('bbl', BBL); // cascades to source_fetches
  };

  beforeAll(() => { db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY); });
  beforeEach(async () => {
    await cleanup();
    await insert('buildings', [{ bbl: BBL, address: 'test', borough: 'test', geom: point() }]);
  });
  afterAll(cleanup);

  it('returns building issues, collapsed nearby 311 noise and nothing else', async () => {
    await insert('issues', [
      row('hpd_violation', 'v1'),                                                    // no geom, like real violations
      row('hpd_complaint', 'c1', { geom: point() }),
      row('hpd_complaint', 'neighbor-c', { bbl: NEIGHBOR, geom: point(LAT + 0.0002) }), // a neighbor's HPD row, ~20 m away
      row('311', 'n1', { bbl: NEIGHBOR, geom: point(LAT + 0.0003), observed_at: recent('22:00') }),
      row('311', 'n2', { bbl: NEIGHBOR, geom: point(LAT + 0.0003), observed_at: recent('23:30') }),
      row('311', 'n3', { bbl: NEIGHBOR, geom: point(LAT + 0.0003), observed_at: recent('02:00', 2) }), // same night, after midnight
      row('311', 'far', { bbl: NEIGHBOR, geom: point(LAT + 0.01) }),                  // ~1.1 km away
      row('311', 'old', { bbl: NEIGHBOR, geom: point(), observed_at: recent('12:00', 400) }), // older than 12 months
    ]);

    const { issues, noise } = await getBuildingIssues(BBL, db);

    expect(issues.map((i) => i.sourceId).sort()).toEqual([`${PREFIX}c1`, `${PREFIX}v1`]);
    expect(issues.find((i) => i.sourceId === `${PREFIX}c1`)).toMatchObject({ source: 'hpd_complaint', lat: LAT, lon: LON });
    expect(issues.find((i) => i.sourceId === `${PREFIX}v1`).lat).toBeUndefined();

    expect(noise).toHaveLength(1);
    expect(noise[0]).toMatchObject({ source: '311', bbl: NEIGHBOR, count: 3, sourceIds: [`${PREFIX}n1`, `${PREFIX}n2`, `${PREFIX}n3`] });
    expect(noise[0].distanceM).toBeGreaterThan(30);
    expect(noise[0].distanceM).toBeLessThan(40);
  });

  describe('the searched building on a multi-building lot', () => {
    beforeEach(() => insert('issues', [
      row('hpd_violation', 'b1-v1', { raw: { bin: '2093459' } }),
      row('hpd_violation', 'b1-v2', { raw: { bin: '2093459' } }),
      row('hpd_complaint', 'b1-c1', { raw: { bin: '2093459' } }),
      row('hpd_violation', 'b2-v1', { raw: { bin: '2093463' } }),
      row('rodent', 'b2-r1', { raw: { bin: '2093463' } }),
      row('rodent', 'b3-r1', { raw: { bin: '3325012' } }),
      row('bedbug', 'nobin', { raw: {} }),
    ]));

    it('returns its own issues next to the lot totals', async () => {
      const { issues, building } = await getBuildingIssues(BBL, db, { bin: '2093459' });
      expect(issues).toHaveLength(7); // the lot, unchanged
      expect(building.bin).toBe('2093459');
      expect(building.matched).toBe(true);
      expect(building.issues.map((i) => i.sourceId).sort()).toEqual([`${PREFIX}b1-c1`, `${PREFIX}b1-v1`, `${PREFIX}b1-v2`]);
    });

    it('reports no match when the BIN has no records on the lot', async () => {
      const { issues, building } = await getBuildingIssues(BBL, db, { bin: '1000000' });
      expect(building).toMatchObject({ bin: '1000000', matched: false, issues: [] });
      expect(issues).toHaveLength(7);
    });

    it('reports no match when the BIN has only rodent records (the 281 Marcus Garvey Blvd case)', async () => {
      const { building } = await getBuildingIssues(BBL, db, { bin: '3325012' });
      expect(building.matched).toBe(false);
      expect(building.issues.map((i) => i.sourceId)).toEqual([`${PREFIX}b3-r1`]); // still returned
    });

    it('matches a numeric BIN', async () => {
      expect((await getBuildingIssues(BBL, db, { bin: 2093463 })).building.issues).toHaveLength(2);
    });

    it('leads with the building when HPD has records for it', async () => {
      expect((await getBuildingIssues(BBL, db, { bin: '2093459' })).building).toMatchObject({ headline: 'building', note: null });
    });

    it('leads with the lot, and says why, when HPD files the lot under other buildings', async () => {
      const { building } = await getBuildingIssues(BBL, db, { bin: '3325012' });
      expect(building.headline).toBe('lot');
      expect(building.note).toBe("The city files this lot's housing records under 2 other buildings on the same lot, so these numbers cover the whole lot.");
    });

    it('leaves building out when no BIN is given', async () => {
      expect(await getBuildingIssues(BBL, db)).not.toHaveProperty('building');
      expect(await getBuildingIssues(BBL, db, { bin: null })).not.toHaveProperty('building');
    });
  });

  it('leads with the building, without a note, when the lot has no HPD records at all', async () => {
    // e.g. 9 Carroll Place: nothing on record, so there's nothing to tell apart
    await insert('issues', [row('rodent', 'only-r1', { raw: { bin: '5000012' } })]);
    const { building } = await getBuildingIssues(BBL, db, { bin: '5000012' });
    expect(building).toMatchObject({ matched: false, headline: 'building', note: null });
  });

  it('uses singular wording for one other building', async () => {
    await insert('issues', [row('hpd_violation', 'other-v1', { raw: { bin: '2093463' } })]);
    const { building } = await getBuildingIssues(BBL, db, { bin: '3325012' });
    expect(building.note).toBe("The city files this lot's housing records under another building on the same lot, so these numbers cover the whole lot.");
  });

  it('names a failed source, without mistaking a skipped-deletes note for a failure', async () => {
    const now = Date.now(), iso = (msAgo) => new Date(now - msAgo).toISOString();
    await insert('source_fetches', [
      fetchRecord('hpd_violation', { last_attempt_at: iso(0), last_success_at: iso(60 * 60_000), last_error: 'Socrata wvxf-dwi5: HTTP 503' }),
      fetchRecord('hpd_complaint', { last_attempt_at: iso(0), last_success_at: null, last_error: 'Socrata ygpa-z7cr: HTTP 500' }),
      fetchRecord('rodent', { last_attempt_at: iso(0), last_success_at: iso(0), last_error: 'skipped deletes: empty response with 3 stored rows' }),
      fetchRecord('bedbug', { last_attempt_at: iso(30 * 3_600_000), last_success_at: iso(30 * 3_600_000) }),
    ]);

    const { sources } = await getBuildingIssues(BBL, db);

    expect(sources.map(({ source, status }) => [source, status])).toEqual([
      ['hpd_violation', 'failed'], ['hpd_complaint', 'failed'], ['rodent', 'ok'], ['bedbug', 'stale'], ['311', 'missing'],
    ]);
    expect(sources[0]).toMatchObject({ error: 'Socrata wvxf-dwi5: HTTP 503', lastSuccessAt: expect.any(String) });
    expect(sources[2].note).toBe('skipped deletes: empty response with 3 stored rows');
  });

  it('changes no database rows on read', async () => {
    await insert('issues', [row('hpd_violation', 'v1'), row('311', 'n1', { bbl: NEIGHBOR, geom: point() })]);
    await insert('source_fetches', [fetchRecord('hpd_violation', { last_success_at: new Date().toISOString() })]);
    const snapshot = async () => {
      const [issues, fetches] = await Promise.all([
        db.from('issues').select('*').like('source_id', `${PREFIX}%`).order('source_id'),
        db.from('source_fetches').select('*').eq('bbl', BBL).order('source'),
      ]);
      return { issues: issues.data, fetches: fetches.data };
    };

    const before = await snapshot();
    await getBuildingIssues(BBL, db);
    await getBuildingIssues(BBL, db);
    expect(await snapshot()).toEqual(before);
  });

  it('reads more than 1,000 nearby noise complaints', async () => {
    // No BBL, so collapse keeps every row separate
    await insert('issues', Array.from({ length: 1100 }, (_, i) => row('311', `many${String(i).padStart(4, '0')}`, { bbl: null, geom: point() })));
    const { noise } = await getBuildingIssues(BBL, db);
    expect(noise).toHaveLength(1100);
    expect(new Set(noise.map((n) => n.sourceId)).size).toBe(1100);
  }, 60_000);

  it('throws when the building has not been saved', async () => {
    await expect(getBuildingIssues('5999999907', db)).rejects.toThrow(/No saved building/);
  });
});
