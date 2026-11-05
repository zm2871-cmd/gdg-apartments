import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues } from '../lib/fetchers/311.js';
import { issueSchema } from '../lib/schemas.js';
import { querySocrata } from '../lib/socrata.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const building = { bbl: '1004120010', bin: '1005393', lat: 40.722093, lon: -73.98799 };
const request = (fields) => ({
  unique_key: '1', bbl: '1004120010', created_date: '2026-10-31T02:53:39.000', complaint_type: 'Noise - Residential',
  descriptor: 'Loud Music/Party', status: 'Closed', latitude: '40.7221', longitude: '-73.9880',
  resolution_description: 'The Police Department responded to the complaint and took action to fix the condition.', ...fields,
});
const run = async (rows) => { vi.mocked(querySocrata).mockResolvedValueOnce(rows); return fetchIssues(building); };
const only = async (fields) => (await run([request(fields)])).issues[0];

const fixtureDir = new URL('./fixtures/three_one_one_requests/', import.meta.url);
const fixtures = readdirSync(fixtureDir).map((f) => [f, JSON.parse(readFileSync(new URL(f, fixtureDir)))]);
const fixtureRow = (predicate) => {
  for (const [, { rows }] of fixtures) { const row = rows.find(predicate); if (row) return row; }
  throw new Error('no fixture row matches');
};

beforeEach(() => vi.mocked(querySocrata).mockReset());

describe('311 fetchIssues', () => {
  describe('query', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-04T15:00:00Z'), toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('asks for noise within 150 m over the last 12 months', async () => {
      await run([]);
      expect(querySocrata).toHaveBeenCalledWith('erm2-nwe9', {
        where: "within_circle(location, 40.722093, -73.98799, 150) AND created_date >= '2025-11-04T00:00:00' AND complaint_type like 'Noise%'",
        order: 'created_date DESC, unique_key',
      });
    });
  });

  it.each([
    [{ lat: undefined }], [{ lon: null }], [{ lat: '' }], [{ lat: 'abc' }], [{ lat: '40.7) OR (1=1' }], [{ lat: 91 }], [{ lon: -181 }],
  ])('rejects invalid coordinates %j without querying', async (change) => {
    await expect(fetchIssues({ ...building, ...change })).rejects.toThrow(/invalid coordinates/);
    expect(querySocrata).not.toHaveBeenCalled();
  });

  describe('exclusions', () => {
    it('drops helicopter noise', async () => {
      expect(await only({ complaint_type: 'Noise - Helicopter', descriptor: 'Other' })).toBeUndefined();
    });

    it.each([
      ['a DEP duplicate', /duplicate of a previously filed/i],
      ['an NYPD out-of-jurisdiction', /does not fall under the jurisdiction/i],
      ['a DEP referral to NYPD', /referred it to the New York Police/i],
    ])('drops %s closure from the fixtures', async (_, pattern) => {
      const row = fixtureRow((r) => r.complaint_type.startsWith('Noise') && pattern.test(r.resolution_description ?? ''));
      expect((await run([row])).issues).toEqual([]);
    });

    it.each(['Noise - Vehicle', 'Noise - Park', 'Noise - Street/Sidewalk', 'Noise - Commercial', 'Noise'])('keeps %s', async (complaint_type) => {
      expect(await only({ complaint_type })).toBeDefined();
    });

    it('ignores non-noise rows, including heat', async () => {
      expect(await only({ complaint_type: 'HEAT/HOT WATER', descriptor: 'ENTIRE BUILDING' })).toBeUndefined();
    });

    it('still counts excluded noise toward latestRecordAt', async () => {
      const { issues, latestRecordAt } = await run([
        request({ unique_key: '2', complaint_type: 'Noise - Helicopter', created_date: '2026-11-01T20:00:00.000' }),
        request({ unique_key: '3', created_date: '2026-10-15T23:00:00.000' }),
      ]);
      expect(issues.map((i) => i.sourceId)).toEqual(['3']);
      expect(latestRecordAt).toBe('2026-11-01T20:00:00.000');
    });
  });

  describe('bbl', () => {
    it('is null for a complaint with no address', async () => {
      const row = fixtureRow((r) => r.complaint_type.startsWith('Noise') && !r.bbl && r.address_type === 'INTERSECTION');
      const [issue] = (await run([row])).issues;
      expect(issue.bbl).toBeNull();
    });

    it("keeps a neighbor's BBL instead of the searched building's", async () => {
      expect((await only({ bbl: '1004120035' })).bbl).toBe('1004120035');
    });

    it('turns an invalid BBL into null', async () => {
      expect((await only({ bbl: '0' })).bbl).toBeNull();
    });
  });

  it.each([
    ['Closed', 'closed'], ['In Progress', 'open'], ['Unspecified', 'open'], ['Started', 'open'], ['Assigned', 'open'], ['Open', 'open'],
  ])('maps status %s to %s', async (status, expected) => {
    expect((await only({ status })).status).toBe(expected);
  });

  it('maps every field of the Issue', async () => {
    const source = request({ unique_key: '67890' });
    expect(await only(source)).toEqual({
      source: '311', sourceId: '67890', bbl: '1004120010', category: 'noise', severity: 1, status: 'closed',
      observedAt: '2026-10-31T02:53:39.000', description: 'Noise - Residential: Loud Music/Party',
      lat: 40.7221, lon: -73.988, raw: source,
    });
  });

  it('leaves the descriptor out when it is missing', async () => {
    expect((await only({ descriptor: undefined })).description).toBe('Noise - Residential');
  });

  it('returns no issues and a null latestRecordAt when there are no complaints', async () => {
    await expect(run([])).resolves.toEqual({ issues: [], latestRecordAt: null });
  });

  it.each(fixtures)('produces valid Issues with unique IDs from %s', async (_, { rows }) => {
    const { issues } = await run(rows);
    expect(new Set(issues.map((i) => i.sourceId)).size).toBe(issues.length);
    expect(issues.every((i) => i.category === 'noise')).toBe(true);
    for (const issue of issues) expect(issueSchema.safeParse(issue).error?.issues, issue.sourceId).toBeUndefined();
  });
});
