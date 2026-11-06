import { describe, expect, it } from 'vitest';
import { toEwkt, toIssueRow } from '../lib/issue.js';

const issue = {
  source: 'hpd_violation', sourceId: '12345', bbl: '3026230011', category: 'repairs', severity: 2,
  status: 'open', observedAt: '2026-10-31T02:53:39.000', description: 'Paint the ceiling', lat: 40.727734, lon: -73.949269,
  raw: { violationid: '12345' },
};

describe('toEwkt', () => {
  it('puts longitude first', () => {
    expect(toEwkt(40.727734, -73.949269)).toBe('SRID=4326;POINT(-73.949269 40.727734)');
  });

  it('accepts Socrata number strings', () => {
    expect(toEwkt('40.7', '-73.9')).toBe('SRID=4326;POINT(-73.9 40.7)');
  });

  it.each([[null, -73.9], [40.7, undefined], ['abc', -73.9]])('returns null for (%j, %j)', (lat, lon) => {
    expect(toEwkt(lat, lon)).toBeNull();
  });
});

describe('toIssueRow', () => {
  it('maps an Issue to an issues table row', () => {
    expect(toIssueRow(issue)).toEqual({
      source: 'hpd_violation', source_id: '12345', bbl: '3026230011', category: 'repairs', severity: 2,
      status: 'open', observed_at: '2026-10-31T02:53:39.000', description: 'Paint the ceiling',
      geom: 'SRID=4326;POINT(-73.949269 40.727734)', raw: { violationid: '12345' },
    });
  });

  it.each(['0', '0000000000', '', null])('turns invalid BBL %j into null instead of failing', (bbl) => {
    expect(toIssueRow({ ...issue, bbl }).bbl).toBeNull();
  });

  it('normalizes a PLUTO-style BBL', () => {
    expect(toIssueRow({ ...issue, bbl: '3026230011.00000000' }).bbl).toBe('3026230011');
  });

  it('allows a missing date or location', () => {
    expect(toIssueRow({ ...issue, observedAt: null }).observed_at).toBeNull();
    expect(toIssueRow({ ...issue, lat: undefined, lon: undefined }).geom).toBeNull();
  });

  it.each([
    ['an unknown category', { category: 'mold' }],
    ['severity 4', { severity: 4 }],
    ['severity as a string', { severity: '2' }],
    ['an unknown status', { status: 'pending' }],
    ['a timestamp with a zone', { observedAt: '2026-10-31T06:53:39.000Z' }],
    ['an empty description', { description: '' }],
    ['a missing sourceId', { sourceId: '' }],
    ['a missing raw row', { raw: undefined }],
  ])('rejects %s', (_, change) => {
    expect(() => toIssueRow({ ...issue, ...change })).toThrow();
  });
});
