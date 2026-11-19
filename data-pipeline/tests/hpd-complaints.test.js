import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues } from '../lib/fetchers/hpd-complaints.js';
import { issueSchema } from '../lib/schemas.js';
import { querySocrata } from '../lib/socrata.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const building = { bbl: '3026230011', bin: '3065755', lat: 40.727734, lon: -73.949269 };
const row = (fields) => ({
  problem_id: '1', bbl: '3026230011', received_date: '2026-10-01T09:30:00.000', problem_duplicate_flag: 'N',
  major_category: 'PLUMBING', minor_category: 'TOILET', problem_code: 'BROKEN OR MISSING', problem_status: 'OPEN',
  latitude: '40.727734', longitude: '-73.949269', ...fields,
});
const run = async (rows) => { vi.mocked(querySocrata).mockResolvedValueOnce(rows); return fetchIssues(building); };
const only = async (fields) => (await run([row(fields)])).issues[0];

beforeEach(() => vi.mocked(querySocrata).mockReset());

describe('hpd-complaints fetchIssues', () => {
  describe('query', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-04T15:00:00Z'), toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('asks for the last 12 months with an unquoted numeric BBL', async () => {
      await run([]);
      expect(querySocrata).toHaveBeenCalledWith('ygpa-z7cr', {
        where: "bbl = 3026230011 AND received_date >= '2025-11-04T00:00:00'",
        order: ':id',
      });
    });
  });

  it('drops flagged duplicates but still counts them toward latestRecordAt', async () => {
    const result = await run([
      row({ problem_id: '111', problem_duplicate_flag: 'Y', received_date: '2026-10-20T08:00:00.000' }),
      row({ problem_id: '222', problem_duplicate_flag: 'N', received_date: '2026-09-01T08:00:00.000' }),
    ]);
    expect(result.issues.map((i) => i.sourceId)).toEqual(['222']);
    expect(result.latestRecordAt).toBe('2026-10-20T08:00:00.000');
  });

  it('keeps a row with no duplicate flag', async () => {
    expect(await only({ problem_duplicate_flag: undefined })).toBeDefined();
  });

  describe('category', () => {
    it.each([
      ['HEAT/HOT WATER', 'ENTIRE BUILDING', 'NO HEAT', 'heat'],
      ['HEAT/HOT WATER', 'APARTMENT ONLY', 'NO HOT WATER', 'heat'],
      ['UNSANITARY CONDITION', 'PESTS', 'ROACHES', 'pests'],
      ['UNSANITARY CONDITION', 'PESTS', 'MICE', 'pests'],
      ['UNSANITARY CONDITION', 'MOLD', 'N/A', 'repairs'],
      ['UNSANITARY CONDITION', 'GARBAGE/RECYCLING STORAGE', 'N/A', 'repairs'],
      ['PLUMBING', 'TOILET', 'BROKEN OR MISSING', 'repairs'],
      ['WATER LEAK', 'DAMP SPOT', 'FROM WALL OR CEILING', 'repairs'],
    ])('%s / %s / %s -> %s', async (major_category, minor_category, problem_code, category) => {
      expect((await only({ major_category, minor_category, problem_code })).category).toBe(category);
    });

    it('does not tag pests outside UNSANITARY CONDITION', async () => {
      expect((await only({ major_category: 'GENERAL', minor_category: 'PESTS' })).category).toBe('repairs');
    });
  });

  it('maps every field of the Issue', async () => {
    const source = row({ problem_id: '4242', major_category: 'HEAT/HOT WATER', minor_category: 'APARTMENT ONLY', problem_code: 'NO HEAT', problem_status: 'CLOSE' });
    expect(await only(source)).toEqual({
      source: 'hpd_complaint', sourceId: '4242', bbl: '3026230011', category: 'heat', severity: 1, status: 'closed',
      observedAt: '2026-10-01T09:30:00.000', description: 'HEAT/HOT WATER: APARTMENT ONLY: NO HEAT',
      lat: 40.727734, lon: -73.949269, raw: source,
    });
  });

  it('maps OPEN and CLOSE to open and closed', async () => {
    const { issues } = await run([row({ problem_id: '333', problem_status: 'OPEN' }), row({ problem_id: '444', problem_status: 'CLOSE' })]);
    expect(issues.map((i) => i.status)).toEqual(['open', 'closed']);
  });

  it('leaves N/A out of the description', async () => {
    expect((await only({ major_category: 'UNSANITARY CONDITION', minor_category: 'MOLD', problem_code: 'N/A' })).description)
      .toBe('UNSANITARY CONDITION: MOLD');
  });

  it('leaves lat and lon unset when the row has no coordinates', async () => {
    const issue = await only({ latitude: undefined, longitude: undefined });
    expect(issue.lat).toBeUndefined();
    expect(issue.lon).toBeUndefined();
  });

  it('returns no issues and a null latestRecordAt when there are no complaints', async () => {
    await expect(run([])).resolves.toEqual({ issues: [], latestRecordAt: null });
  });

  it('rejects an invalid BBL without querying', async () => {
    await expect(fetchIssues({ ...building, bbl: '0' })).rejects.toThrow(/invalid BBL/);
    expect(querySocrata).not.toHaveBeenCalled();
  });

  it('produces valid Issues from every saved complaints fixture', async () => {
    const dir = new URL('./fixtures/hpd_complaints/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const { rows } = JSON.parse(readFileSync(new URL(file, dir)));
      const { issues } = await run(rows);
      expect(issues.length).toBe(rows.filter((r) => r.problem_duplicate_flag !== 'Y').length);
      for (const issue of issues) expect(issueSchema.safeParse(issue).error?.issues, `${file} ${issue.sourceId}`).toBeUndefined();
    }
  });
});
