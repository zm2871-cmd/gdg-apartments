import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues } from '../lib/fetchers/bedbug.js';
import { issueSchema } from '../lib/schemas.js';
import { querySocrata } from '../lib/socrata.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const building = { bbl: '3016290001', bin: '3325012', lat: 40.68, lon: -73.93 };
const filing = (fields) => ({
  building_id: '808403', registration_id: '374510', bbl: '3016290001', filing_date: '2025-12-15T00:00:00.000',
  filing_period_start_date: '2024-11-01T00:00:00.000', filling_period_end_date: '2025-10-31T00:00:00.000',
  of_dwelling_units: '35', infested_dwelling_unit_count: '0', eradicated_unit_count: '0', re_infested_dwelling_unit: '0',
  latitude: '40.68', longitude: '-73.93', ...fields,
});
const period = (endYear) => ({
  filing_period_start_date: `${endYear - 1}-11-01T00:00:00.000`, filling_period_end_date: `${endYear}-10-31T00:00:00.000`,
});
const run = async (rows) => { vi.mocked(querySocrata).mockResolvedValueOnce(rows); return fetchIssues(building); };

beforeEach(() => vi.mocked(querySocrata).mockReset());

describe('bedbug fetchIssues', () => {
  it('queries every filing for the quoted BBL', async () => {
    await run([]);
    expect(querySocrata).toHaveBeenCalledWith('wz6d-d3jb', { where: "bbl = '3016290001'", order: 'filing_date DESC, :id' });
  });

  it('records a zero filing as latestRecordAt without emitting an issue', async () => {
    await expect(run([filing({ filing_date: '2025-12-15T00:00:00.000' })]))
      .resolves.toEqual({ issues: [], latestRecordAt: '2025-12-15T00:00:00.000' });
  });

  describe('severity and status', () => {
    it.each([
      ['all eradicated', { infested_dwelling_unit_count: '2', eradicated_unit_count: '2' }, 1, 'closed'],
      ['some remain', { infested_dwelling_unit_count: '3', eradicated_unit_count: '1' }, 2, 'open'],
      ['re-infested', { infested_dwelling_unit_count: '2', eradicated_unit_count: '2', re_infested_dwelling_unit: '1' }, 3, 'closed'],
      ['re-infested with units remaining', { infested_dwelling_unit_count: '4', eradicated_unit_count: '1', re_infested_dwelling_unit: '2' }, 3, 'open'],
    ])('%s -> severity %i, %s', async (_, counts, severity, status) => {
      const [issue] = (await run([filing(counts)])).issues;
      expect(issue).toMatchObject({ category: 'bedbugs', severity, status });
    });

    it('treats a missing eradicated count as zero', async () => {
      const [issue] = (await run([filing({ infested_dwelling_unit_count: '1', eradicated_unit_count: undefined })])).issues;
      expect(issue).toMatchObject({ severity: 2, status: 'open' });
    });
  });

  it('maps every field of the Issue', async () => {
    const source = filing({ infested_dwelling_unit_count: '3', eradicated_unit_count: '1', re_infested_dwelling_unit: '1' });
    expect((await run([source])).issues[0]).toEqual({
      source: 'bedbug', sourceId: '808403|374510|2025-12-15T00:00:00.000|2025-10-31T00:00:00.000', bbl: '3016290001',
      category: 'bedbugs', severity: 3, status: 'open', observedAt: '2025-12-15T00:00:00.000',
      description: '3 of 35 units infested, 1 eradicated, 1 re-infested', lat: 40.68, lon: -73.93, raw: source,
    });
  });

  it('collapses exact duplicate rows into one issue', async () => {
    const row = filing({ infested_dwelling_unit_count: '1' });
    const { issues } = await run([row, { ...row }, { ...row }]);
    expect(issues).toHaveLength(1);
  });

  it('keeps only the newest filing per building per period', async () => {
    // building 808400 refiled for the same period
    const { issues } = await run([
      filing({ building_id: '808400', filing_date: '2025-12-15T00:00:00.000', infested_dwelling_unit_count: '2' }),
      filing({ building_id: '808400', filing_date: '2026-05-08T00:00:00.000', infested_dwelling_unit_count: '1' }),
    ]);
    expect(issues.map((i) => i.observedAt)).toEqual(['2026-05-08T00:00:00.000']);
    expect(issues[0].description).toMatch(/^1 of 35/);
  });

  it('keeps separate buildings on the same lot in the same period', async () => {
    const { issues } = await run([
      filing({ building_id: '808400', infested_dwelling_unit_count: '1' }),
      filing({ building_id: '808403', infested_dwelling_unit_count: '1' }),
    ]);
    expect(issues).toHaveLength(2);
  });

  describe('latest 2 filing periods for the whole lot', () => {
    it('drops filings from older periods', async () => {
      const { issues, latestRecordAt } = await run([
        filing({ ...period(2025), filing_date: '2025-12-15T00:00:00.000', infested_dwelling_unit_count: '1' }),
        filing({ ...period(2024), filing_date: '2024-12-19T00:00:00.000', infested_dwelling_unit_count: '1' }),
        filing({ ...period(2023), filing_date: '2023-12-01T00:00:00.000', infested_dwelling_unit_count: '1' }),
      ]);
      expect(issues.map((i) => i.observedAt)).toEqual(['2025-12-15T00:00:00.000', '2024-12-19T00:00:00.000']);
      expect(latestRecordAt).toBe('2025-12-15T00:00:00.000');
    });

    it('uses the filing period, not the filing date, for late filings', async () => {
      // 190 Orchard St files mid-year for the period that ended the previous October
      const { issues } = await run([
        filing({ ...period(2025), filing_date: '2026-07-08T00:00:00.000', infested_dwelling_unit_count: '1' }),
        filing({ ...period(2024), filing_date: '2025-06-09T00:00:00.000', infested_dwelling_unit_count: '1' }),
        filing({ ...period(2023), filing_date: '2024-07-11T00:00:00.000', infested_dwelling_unit_count: '1' }),
      ]);
      expect(issues.map((i) => i.raw.filling_period_end_date.slice(0, 4))).toEqual(['2025', '2024']);
    });

    it('picks periods across the lot, so a building that stopped filing has nothing recent', async () => {
      const { issues } = await run([
        filing({ building_id: 'A', ...period(2025), infested_dwelling_unit_count: '0' }),
        filing({ building_id: 'A', ...period(2024), filing_date: '2024-12-19T00:00:00.000', infested_dwelling_unit_count: '0' }),
        filing({ building_id: 'B', ...period(2023), filing_date: '2023-12-01T00:00:00.000', infested_dwelling_unit_count: '5' }),
      ]);
      expect(issues).toEqual([]);
    });

    it.each([
      ['2025-12-15T00:00:00.000', '2025'], // filed in December: the period ending that October
      ['2026-05-08T00:00:00.000', '2025'], // filed late: the period ending the October before
    ])('infers the period of a filing with no period dates filed on %s', async (filing_date, endYear) => {
      const noPeriod = filing({ building_id: 'X', filing_date, filing_period_start_date: undefined, filling_period_end_date: undefined, infested_dwelling_unit_count: '1' });
      const { issues } = await run([
        noPeriod,
        filing({ building_id: 'Y', ...period(Number(endYear)), infested_dwelling_unit_count: '1' }),
        filing({ building_id: 'Y', ...period(Number(endYear) - 1), filing_date: '2020-12-01T00:00:00.000', infested_dwelling_unit_count: '1' }),
        filing({ building_id: 'Y', ...period(Number(endYear) - 2), filing_date: '2019-12-01T00:00:00.000', infested_dwelling_unit_count: '1' }),
      ]);
      expect(issues.map((i) => i.raw.building_id).sort()).toEqual(['X', 'Y', 'Y']);
      expect(issues.find((i) => i.raw.building_id === 'X').sourceId).toBe(`X|374510|${filing_date}|`);
    });
  });

  it('rejects an invalid BBL without querying', async () => {
    await expect(fetchIssues({ ...building, bbl: '0' })).rejects.toThrow(/invalid BBL/);
    expect(querySocrata).not.toHaveBeenCalled();
  });

  it('produces valid Issues with unique IDs from every saved bedbug fixture', async () => {
    const dir = new URL('./fixtures/bedbug_filings/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const { rows } = JSON.parse(readFileSync(new URL(file, dir)));
      const { issues } = await run(rows);
      expect(new Set(issues.map((i) => i.sourceId)).size, file).toBe(issues.length);
      for (const issue of issues) expect(issueSchema.safeParse(issue).error?.issues, `${file} ${issue.sourceId}`).toBeUndefined();
    }
  });
});
