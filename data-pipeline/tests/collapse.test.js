import { describe, expect, it } from 'vitest';
import { collapse, periodOf } from '../lib/collapse.js';

let nextId = 0;
const noise = (observedAt, fields = {}) => ({
  source: '311', sourceId: String(++nextId), bbl: '1004120010', category: 'noise', severity: 1, status: 'closed',
  observedAt, description: 'Noise - Residential: Loud Music/Party', raw: { complaint_type: 'Noise - Residential' }, ...fields,
});

describe('periodOf', () => {
  it.each([
    ['2026-10-31T23:00:00', 'night:2026-10-31'],
    ['2026-11-01T02:00:00', 'night:2026-10-31'], // after midnight belongs to the night it started
    ['2026-11-01T05:59:59', 'night:2026-10-31'],
    ['2026-11-01T06:00:00', 'day:2026-11-01'],
    ['2026-11-01T17:59:59', 'day:2026-11-01'],
    ['2026-11-01T18:00:00', 'night:2026-11-01'],
    ['2026-03-01T01:00:00', 'night:2026-02-28'], // across a month boundary
    ['2028-03-01T01:00:00', 'night:2028-02-29'], // leap year
    ['2026-01-01T03:00:00', 'night:2025-12-31'], // across a year boundary
  ])('%s -> %s', (observedAt, period) => expect(periodOf(observedAt)).toBe(period));
});

describe('collapse', () => {
  it('turns 10 complaints in one night into 1', () => {
    const night = Array.from({ length: 10 }, (_, i) => noise(`2026-10-31T${String(18 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '05'}:00`));
    const [row, ...rest] = collapse(night);
    expect(rest).toEqual([]);
    expect(row.count).toBe(10);
    expect(row.sourceIds).toEqual(night.map((n) => n.sourceId));
  });

  it('puts 11 pm and 2 am in the same night', () => {
    const rows = collapse([noise('2026-10-31T23:00:00'), noise('2026-11-01T02:00:00')]);
    expect(rows).toHaveLength(1);
    expect(rows[0].count).toBe(2);
  });

  it('keeps 2 am and 7 pm the next evening separate', () => {
    expect(collapse([noise('2026-11-01T02:00:00'), noise('2026-11-01T19:00:00')])).toHaveLength(2);
  });

  it('merges complaints on the same calendar day during daytime', () => {
    const rows = collapse([noise('2026-11-01T09:00:00'), noise('2026-11-01T16:30:00')]);
    expect(rows.map((r) => r.count)).toEqual([2]);
  });

  it('keeps a daytime complaint separate from that evening', () => {
    expect(collapse([noise('2026-11-01T17:00:00'), noise('2026-11-01T18:30:00')])).toHaveLength(2);
  });

  it('keeps different complaint types separate', () => {
    const rows = collapse([
      noise('2026-10-31T23:00:00'),
      noise('2026-10-31T23:10:00', { raw: { complaint_type: 'Noise - Street/Sidewalk' } }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it('keeps different BBLs separate', () => {
    expect(collapse([noise('2026-10-31T23:00:00'), noise('2026-10-31T23:10:00', { bbl: '1004120035' })])).toHaveLength(2);
  });

  it('never merges rows with no BBL or no date', () => {
    const rows = collapse([
      noise('2026-10-31T23:00:00', { bbl: null }), noise('2026-10-31T23:05:00', { bbl: null }),
      noise(null), noise(null),
    ]);
    expect(rows.map((r) => r.count)).toEqual([1, 1, 1, 1]);
  });

  it('keeps the earliest complaint as the row and marks it open if any complaint is open', () => {
    const late = noise('2026-11-01T01:00:00', { status: 'open' });
    const early = noise('2026-10-31T22:00:00', { status: 'closed' });
    const [row] = collapse([late, early]);
    expect(row).toMatchObject({ sourceId: early.sourceId, observedAt: early.observedAt, status: 'open', sourceIds: [early.sourceId, late.sourceId] });
  });

  it('does not modify its input', () => {
    const input = [noise('2026-10-31T23:00:00'), noise('2026-10-31T23:30:00')];
    const copy = structuredClone(input);
    collapse(input);
    expect(input).toEqual(copy);
  });

  it('returns [] for no complaints', () => expect(collapse([])).toEqual([]));
});
