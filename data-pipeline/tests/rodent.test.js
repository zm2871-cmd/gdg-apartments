import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchIssues } from '../lib/fetchers/rodent.js';
import { issueSchema } from '../lib/schemas.js';
import { querySocrata } from '../lib/socrata.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const building = { bbl: '3016290001', bin: '3325012', lat: 40.68, lon: -73.93 };
const row = (fields) => ({
  job_id: 'PC1', bbl: '3016290001', boro_code: '3', block: '1629', lot: '1', inspection_type: 'Initial',
  result: 'Failed for Rat Activity', inspection_date: '2026-05-12T10:44:00.000', latitude: '40.68', longitude: '-73.93', ...fields,
});
const run = async (rows) => { vi.mocked(querySocrata).mockResolvedValueOnce(rows); return fetchIssues(building); };

beforeEach(() => vi.mocked(querySocrata).mockReset());

describe('rodent fetchIssues', () => {
  describe('query', () => {
    beforeEach(() => vi.useFakeTimers({ now: new Date('2026-11-04T15:00:00Z'), toFake: ['Date'] }));
    afterEach(() => vi.useRealTimers());

    it('matches by bbl or by unpadded borough, block and lot, over the last 2 years', async () => {
      await run([]);
      expect(querySocrata).toHaveBeenCalledWith('p937-wjvj', {
        where: "(bbl = 3016290001 OR (boro_code = 3 AND block = '1629' AND lot = '1')) AND inspection_date >= '2024-11-04T00:00:00'",
        order: 'inspection_date DESC, :id',
      });
    });

    it('strips leading zeros from block and lot', async () => {
      vi.mocked(querySocrata).mockResolvedValueOnce([]);
      await fetchIssues({ ...building, bbl: '1004120010' });
      expect(vi.mocked(querySocrata).mock.calls[0][1].where).toContain("boro_code = 1 AND block = '412' AND lot = '10'");
    });
  });

  it('includes a row with no BBL that matched on block and lot, under the searched BBL', async () => {
    const { issues } = await run([row({ bbl: undefined })]);
    expect(issues).toHaveLength(1);
    expect(issues[0].bbl).toBe('3016290001');
    expect(issues[0].raw.bbl).toBeUndefined(); // the source row is kept as received
  });

  it('uses the searched BBL when the row carries a different one', async () => {
    // seen upstream: boro_code 3 with bbl 4089840010
    const [issue] = (await run([row({ bbl: '4089840010' })])).issues;
    expect(issue.bbl).toBe('3016290001');
  });

  it.each([
    ['Treatments', 'Bait applied'],
    ['Treatments', 'Monitoring visit'],
    ['Stoppage', 'Stoppage done'],
    ['Clean Ups', 'Cleanup done'],
  ])('drops %s / %s rows', async (inspection_type, result) => {
    await expect(run([row({ inspection_type, result })])).resolves.toEqual({ issues: [], latestRecordAt: null });
  });

  it.each([
    ['Failed for Rat Activity', 3],
    ['Failed for Rat Activity and Other Reason', 3],
    ['Failed for Other Reason', 1],
  ])('maps %s to severity %i', async (result, severity) => {
    const [issue] = (await run([row({ result })])).issues;
    expect(issue).toMatchObject({ category: 'pests', severity });
  });

  it('does not emit passes as issues', async () => {
    expect((await run([row({ result: 'Passed' })])).issues).toEqual([]);
  });

  describe('status', () => {
    it('closes failures once a later inspection in the same job passes', async () => {
      // PC8719887 at 281 Marcus Garvey Blvd: two failures, bait, then a pass
      const { issues } = await run([
        row({ job_id: 'PC8719887', inspection_type: 'Compliance', result: 'Passed', inspection_date: '2026-09-17T12:42:00.000' }),
        row({ job_id: 'PC8719887', inspection_type: 'Treatments', result: 'Bait applied', inspection_date: '2026-08-31T10:15:00.000' }),
        row({ job_id: 'PC8719887', inspection_type: 'Compliance', result: 'Failed for Rat Activity and Other Reason', inspection_date: '2026-07-10T08:50:00.000' }),
        row({ job_id: 'PC8719887', inspection_type: 'Initial', result: 'Failed for Other Reason', inspection_date: '2026-05-12T10:44:00.000' }),
      ]);
      expect(issues.map((i) => [i.sourceId, i.status])).toEqual([
        ['PC8719887|2026-07-10T08:50:00.000', 'closed'],
        ['PC8719887|2026-05-12T10:44:00.000', 'closed'],
      ]);
    });

    it('keeps a failure open when a pass belongs to a different job', async () => {
      // Parkchester: a pass in another building's job must not close this failure
      const { issues } = await run([
        row({ job_id: 'PC8494258', result: 'Failed for Rat Activity and Other Reason', inspection_date: '2025-02-26T10:55:00.000' }),
        row({ job_id: 'PC8493497', result: 'Passed', inspection_date: '2025-03-04T13:01:00.000' }),
      ]);
      expect(issues.map((i) => i.status)).toEqual(['open']);
    });

    it('keeps a failure open when the only pass in its job came earlier', async () => {
      const { issues } = await run([
        row({ job_id: 'PC2', result: 'Passed', inspection_date: '2026-01-01T09:00:00.000' }),
        row({ job_id: 'PC2', inspection_type: 'Compliance', result: 'Failed for Rat Activity', inspection_date: '2026-03-01T09:00:00.000' }),
      ]);
      expect(issues.map((i) => i.status)).toEqual(['open']);
    });

    it('gives each repeat failure in a job its own issue, open while the job has no pass', async () => {
      const { issues } = await run([
        row({ job_id: 'PC8623006', inspection_type: 'Initial', inspection_date: '2025-11-03T10:35:00.000' }),
        row({ job_id: 'PC8623006', inspection_type: 'Compliance', inspection_date: '2026-01-15T10:00:00.000' }),
        row({ job_id: 'PC8623006', inspection_type: 'Compliance', inspection_date: '2026-07-31T10:00:00.000' }),
      ]);
      expect(issues).toHaveLength(3);
      expect(new Set(issues.map((i) => i.sourceId)).size).toBe(3);
      expect(issues.every((i) => i.status === 'open')).toBe(true);
    });
  });

  it('maps every field of the Issue', async () => {
    const source = row({ job_id: 'PC9', inspection_type: 'Compliance', result: 'Failed for Rat Activity' });
    expect((await run([source])).issues[0]).toEqual({
      source: 'rodent', sourceId: 'PC9|2026-05-12T10:44:00.000', bbl: '3016290001', category: 'pests', severity: 3,
      status: 'open', observedAt: '2026-05-12T10:44:00.000', description: 'Compliance inspection: Failed for Rat Activity',
      lat: 40.68, lon: -73.93, raw: source,
    });
  });

  it('counts passes but not bait visits toward latestRecordAt', async () => {
    const { latestRecordAt } = await run([
      row({ inspection_type: 'Treatments', result: 'Bait applied', inspection_date: '2026-10-16T09:45:00.000' }),
      row({ result: 'Passed', inspection_date: '2026-09-15T10:00:00.000' }),
      row({ inspection_date: '2026-06-02T10:05:00.000' }),
    ]);
    expect(latestRecordAt).toBe('2026-09-15T10:00:00.000');
  });

  it('rejects an invalid BBL without querying', async () => {
    await expect(fetchIssues({ ...building, bbl: '0' })).rejects.toThrow(/invalid BBL/);
    expect(querySocrata).not.toHaveBeenCalled();
  });

  it('produces valid Issues with unique IDs from every saved rodent fixture', async () => {
    const dir = new URL('./fixtures/rodent_inspections/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const { rows } = JSON.parse(readFileSync(new URL(file, dir)));
      const { issues } = await run(rows);
      expect(new Set(issues.map((i) => i.sourceId)).size, file).toBe(issues.length);
      for (const issue of issues) expect(issueSchema.safeParse(issue).error?.issues, `${file} ${issue.sourceId}`).toBeUndefined();
    }
  });
});
