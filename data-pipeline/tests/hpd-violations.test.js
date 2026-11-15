import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues } from '../lib/fetchers/hpd-violations.js';
import { issueSchema } from '../lib/schemas.js';
import { querySocrata } from '../lib/socrata.js';
import { cutoff } from '../lib/sources.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const building = { bbl: '3026230011', bin: '3065755', lat: 40.727734, lon: -73.949269 };
const row = (fields) => ({
  violationid: '1', bbl: '3026230011', class: 'B', violationstatus: 'Open',
  inspectiondate: '2026-10-01T00:00:00.000', novdescription: '§ 27-2005 ADM CODE REPAIR THE BROKEN PLASTER', ...fields,
});
const run = async (rows) => { vi.mocked(querySocrata).mockResolvedValueOnce(rows); return fetchIssues(building); };
const categoryOf = async (novdescription) => (await run([row({ novdescription })])).issues[0].category;

beforeEach(() => vi.mocked(querySocrata).mockReset());

describe('hpd-violations fetchIssues', () => {
  describe('query', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-03T15:00:00Z'), toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('asks for the last 3 years plus everything still open', async () => {
      await run([]);
      expect(querySocrata).toHaveBeenCalledWith('wvxf-dwi5', {
        where: "bbl = '3026230011' AND (inspectiondate >= '2023-11-03T00:00:00' OR violationstatus = 'Open')",
        order: ':id',
      });
    });
  });

  it('returns an open violation older than 3 years', async () => {
    const { issues } = await run([row({ violationid: 'old', inspectiondate: '2019-02-14T00:00:00.000', violationstatus: 'Open' })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ sourceId: 'old', status: 'open', observedAt: '2019-02-14T00:00:00.000' });
  });

  it.each([['A', 1], ['B', 2], ['C', 3]])('maps class %s to severity %i', async (cls, severity) => {
    expect((await run([row({ class: cls })])).issues[0].severity).toBe(severity);
  });

  it('drops class I but still counts it toward latestRecordAt', async () => {
    const result = await run([
      row({ violationid: 'i', class: 'I', inspectiondate: '2026-10-20T00:00:00.000' }),
      row({ violationid: 'b', class: 'B', inspectiondate: '2026-09-01T00:00:00.000' }),
    ]);
    expect(result.issues.map((i) => i.sourceId)).toEqual(['b']);
    expect(result.latestRecordAt).toBe('2026-10-20T00:00:00.000');
  });

  it('maps Open and Close to open and closed', async () => {
    const { issues } = await run([row({ violationid: 'o', violationstatus: 'Open' }), row({ violationid: 'c', violationstatus: 'Close' })]);
    expect(issues.map((i) => i.status)).toEqual(['open', 'closed']);
  });

  describe('category', () => {
    it.each([
      'ABATE THE INFESTATION CONSISTING OF ROACHES IN THE ENTIRE APARTMENT',
      'ABATE THE INFESTATION CONSISTING OF MICE IN THE KITCHEN',
      'ABATE THE INFESTATION CONSISTING OF RATS AT THE CELLAR',
      'ABATE THE INFESTATION CONSISTING OF BED BUGS IN THE BEDROOM',
    ])('tags pests: %s', async (text) => expect(await categoryOf(text)).toBe('pests'));

    it.each([
      'REPAIR THE BROKEN WALKWAY AT THE APPROACH TO THE ENTRANCE',
      '§27-2107 ADM CODE OWNER FAILED TO FILE A VALID REGISTRATION STATEMENT',
    ])('does not tag pests: %s', async (text) => expect(await categoryOf(text)).toBe('repairs'));

    it.each([
      '§ 27-2029 ADM CODE PROVIDE AN ADEQUATE SUPPLY OF HEAT FOR THE APARTMENT',
      '§ 27-2031 ADM CODE PROVIDE HOT WATER AT ALL HOT WATER FIXTURES IN THE KITCHEN',
    ])('tags heat: %s', async (text) => expect(await categoryOf(text)).toBe('heat'));

    it.each([
      '§ 27-2005 ADM CODE REPLACE WITH NEW THE MISSING ESCUTCHEON PLATE AT HEAT RISER IN THE BATHROOM',
      '§ 27-2005 ADM CODE ABATE THE NUISANCE CONSISTING OF SCALDING HOT WATER ABOVE 130 DEGREES',
      '§ 27-2033 ADM CODE PROVIDE READY ACCESS TO BUILDINGS HEATING SYSTEM NO ACCESS TO BOILER ROOM',
    ])('keeps heat-adjacent repairs as repairs: %s', async (text) => expect(await categoryOf(text)).toBe('repairs'));
  });

  it('falls back to novissueddate when inspectiondate is empty', async () => {
    const { issues, latestRecordAt } = await run([row({ inspectiondate: undefined, novissueddate: '2026-08-05T00:00:00.000' })]);
    expect(issues[0].observedAt).toBe('2026-08-05T00:00:00.000');
    expect(latestRecordAt).toBe('2026-08-05T00:00:00.000');
  });

  it('keeps the whole source row in raw', async () => {
    const source = row({ extra_upstream_column: 'x' });
    expect((await run([source])).issues[0].raw).toBe(source);
  });

  it('returns no issues and a null latestRecordAt when there are no violations', async () => {
    await expect(run([])).resolves.toEqual({ issues: [], latestRecordAt: null });
  });

  it('rejects an invalid BBL without querying', async () => {
    await expect(fetchIssues({ ...building, bbl: '0' })).rejects.toThrow(/invalid BBL/);
    expect(querySocrata).not.toHaveBeenCalled();
  });

  it('produces valid Issues from every saved violations fixture', async () => {
    const dir = new URL('./fixtures/hpd_violations/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const { rows } = JSON.parse(readFileSync(new URL(file, dir)));
      const { issues } = await run(rows);
      for (const issue of issues) expect(issueSchema.safeParse(issue).error?.issues, `${file} ${issue.sourceId}`).toBeUndefined();
    }
  });
});

describe('cutoff', () => {
  it.each([
    ['2026-11-03T15:00:00Z', 36, '2023-11-03T00:00:00'],
    ['2026-11-03T03:00:00Z', 12, '2025-11-02T00:00:00'], // 10pm Nov 2 in New York
    ['2026-03-31T16:00:00Z', 1, '2026-02-28T00:00:00'],  // clamped to the end of February
    ['2028-03-31T16:00:00Z', 1, '2028-02-29T00:00:00'],  // leap year
  ])('%s minus %i months is %s', (now, months, expected) => {
    expect(cutoff(months, new Date(now))).toBe(expected);
  });
});
