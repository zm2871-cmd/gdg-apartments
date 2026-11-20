import { describe, expect, it } from 'vitest';
import { compare, score } from '../../src/lib/scoring';
import { defaultWeights, type Category, type Coverage, type Evidence, type Identity, type Report } from '../../src/lib/domain';
import { sourceNames } from '../../src/lib/nyc/client';

const now = new Date('2026-11-19T12:00:00Z');
const sources = [sourceNames.violations, sourceNames.bedbugs, sourceNames.rodents, sourceNames.requests, sourceNames.noise];

function record(id: string, category: Category, source: string, overrides: Partial<Evidence> = {}): Evidence {
  return {
    id, externalId: id, category, source, kind: 'violation', scope: 'building',
    date: '2026-11-01', status: 'Open', severity: 3, description: `${category} issue`,
    url: 'https://data.cityofnewyork.us', positive: true, ...overrides,
  };
}

function report(id: string, records: Evidence[] = [], identityOverrides: Partial<Identity> = {}, coverageOverrides: Partial<Record<string, Coverage['status']>> = {}): Report {
  const identity: Identity = {
    id, address: `${id} Test Street`, borough: 'Manhattan', lat: 40.75, lng: -73.98,
    confidence: 'building', lotBuildings: 1, lotUnits: 20, ...identityOverrides,
  };
  const coverage: Coverage[] = sources.map(source => ({
    source, status: coverageOverrides[source] ?? 'ok', checkedAt: now.toISOString(), count: records.filter(row => row.source === source).length,
  }));
  return { identity, records, coverage, scores: score(records), checkedAt: now.toISOString(), demo: false };
}

describe('live shortlist ranking', () => {
  it('keeps building 311 complaints comparable when only the nearby noise feed is truncated', () => {
    const a = report('a', [record('a-311-heat', 'heat', sourceNames.requests, { kind: 'complaint', scope: 'tax_lot' })],
      {}, { [sourceNames.noise]: 'truncated' });
    const b = report('b');
    const result = compare([a, b], { ...defaultWeights, heat: 5 }, now);
    const heat = result.details?.categories.find(row => row.category === 'heat');
    expect(heat?.sources).toEqual([sourceNames.violations, sourceNames.requests]);
    expect(heat?.values.find(row => row.id === 'a')?.evidenceIds).toEqual(['a-311-heat']);
    expect(result.details?.categories.find(row => row.category === 'noise')?.comparable).toBe(false);
    expect(result.recommendedBuildingId).toBe('b');
  });

  it('changes the order when a renter changes priorities and grounds the reasons in real records', () => {
    const a = report('a', [record('a-heat', 'heat', sourceNames.violations)]);
    const b = report('b', [record('b-noise', 'noise', sourceNames.noise,
      { kind: 'complaint', scope: 'nearby', analysisKey: 'noise:street' })]);
    const heatFirst = compare([a, b], { ...defaultWeights, heat: 5, noise: 1 }, now);
    const noiseFirst = compare([a, b], { ...defaultWeights, heat: 1, noise: 5 }, now);
    expect(heatFirst.method).toBe('relative_shortlist');
    expect(heatFirst.recommendedBuildingId).toBe('b');
    expect(noiseFirst.recommendedBuildingId).toBe('a');
    expect(heatFirst.details?.status).toBe('ranked');
    expect(heatFirst.details?.categories.find(row => row.category === 'heat')?.values.find(row => row.id === 'a')?.evidenceIds).toEqual(['a-heat']);
    expect(heatFirst.details?.categories.find(row => row.category === 'noise')?.values.find(row => row.id === 'b')?.evidenceIds).toEqual(['b-noise']);
    expect(heatFirst.ranked.every(row => row.value === null || row.value >= 0 && row.value <= 1)).toBe(true);
  });

  it('uses only sources with complete coverage for every building and explains omitted sources', () => {
    const a = report('a', [record('a-hpd', 'heat', sourceNames.violations),
      record('a-311', 'heat', sourceNames.requests, { kind: 'complaint', scope: 'tax_lot' })]);
    const b = report('b', [], {}, { [sourceNames.requests]: 'error' });
    const result = compare([a, b], { ...defaultWeights, pests: 0, bedbugs: 0, maintenance: 0, noise: 0 }, now);
    const heat = result.details?.categories.find(row => row.category === 'heat');
    expect(heat?.sources).toEqual([sourceNames.violations]);
    expect(heat?.reason).toContain(sourceNames.requests);
    expect(heat?.values.find(row => row.id === 'a')?.evidenceIds).toEqual(['a-hpd']);
    // Nearby noise has its own feed, so a failed building-complaint fetch no longer removes it.
    expect(result.missing).not.toContain('noise');
    expect(result.recommendedBuildingId).toBe('b');
  });

  it('normalizes building burdens by reliable unit counts', () => {
    const a = report('a', [record('a-heat', 'heat', sourceNames.violations)], { lotUnits: 10 });
    const b = report('b', [record('b-heat-1', 'heat', sourceNames.violations), record('b-heat-2', 'heat', sourceNames.violations)], { lotUnits: 100 });
    const result = compare([a, b], { ...defaultWeights, pests: 0, bedbugs: 0, maintenance: 0, noise: 0 }, now);
    const heat = result.details?.categories.find(row => row.category === 'heat');
    expect(heat?.measure).toBe('per_100_units');
    expect(heat?.values.find(row => row.id === 'a')?.burden).toBe(30);
    expect(heat?.values.find(row => row.id === 'b')?.burden).toBe(6);
    expect(result.recommendedBuildingId).toBe('b');
  });

  it('refuses a building comparison when a tax lot has multiple buildings', () => {
    const a = report('a', [record('a-heat', 'heat', sourceNames.violations)]);
    const b = report('b', [], { lotBuildings: 2 });
    const result = compare([a, b], { ...defaultWeights, pests: 0, bedbugs: 0, maintenance: 0, noise: 0 }, now);
    const heat = result.details?.categories.find(row => row.category === 'heat');
    expect(heat?.comparable).toBe(false);
    expect(heat?.reason).toMatch(/single-building match/);
    expect(result.recommendedBuildingId).toBeNull();
  });

  it('leaves a no-record comparison inconclusive and does not claim a safe winner', () => {
    const result = compare([report('a'), report('b')], defaultWeights, now);
    expect(result.details?.status).toBe('insufficient_evidence');
    expect(result.recommendedBuildingId).toBeNull();
    expect(result.details?.reason).toContain('Missing records do not prove');
  });

  it('returns a tie when the selected buildings have the same observed burden', () => {
    const a = report('a', [record('a-heat', 'heat', sourceNames.violations)]);
    const b = report('b', [record('b-heat', 'heat', sourceNames.violations)]);
    const result = compare([a, b], defaultWeights, now);
    expect(result.details?.status).toBe('tied');
    expect(result.recommendedBuildingId).toBeNull();
  });

  it('does not cite negative findings, future records, or deduplicated complaints', () => {
    const a = report('a', [
      record('negative-bedbugs', 'bedbugs', sourceNames.bedbugs, { kind: 'filing', positive: false }),
      record('future-bedbugs', 'bedbugs', sourceNames.bedbugs, { kind: 'filing', date: '2030-01-01' }),
      record('noise-1', 'noise', sourceNames.noise, { kind: 'complaint', scope: 'nearby', analysisKey: 'noise:street' }),
      record('noise-2', 'noise', sourceNames.noise, { kind: 'complaint', scope: 'nearby', analysisKey: 'noise:street' }),
    ]);
    const result = compare([a, report('b')], defaultWeights, now);
    expect(result.details?.categories.find(row => row.category === 'bedbugs')?.values.find(row => row.id === 'a')?.evidenceIds).toEqual([]);
    expect(result.details?.categories.find(row => row.category === 'noise')?.values.find(row => row.id === 'a')?.evidenceIds).toEqual(['noise-1']);
    for (const detail of result.details?.categories ?? []) {
      for (const value of detail.values) {
        const original = [a, report('b')].find(row => row.identity.id === value.id)!;
        expect(value.evidenceIds.every(id => original.records.some(record => record.id === id))).toBe(true);
      }
    }
  });

  it('does not let an invalid first copy suppress a valid record with the same key', () => {
    const a = report('a', [
      record('same-id', 'heat', sourceNames.violations, { positive: false }),
      record('same-id', 'heat', sourceNames.violations),
      record('later-id', 'heat', sourceNames.violations, { date: 'not-a-date' }),
      record('later-id', 'heat', sourceNames.violations),
    ]);
    const result = compare([a, report('b')], defaultWeights, now);
    expect(result.details?.categories.find(row => row.category === 'heat')?.values.find(row => row.id === 'a')?.evidenceIds)
      .toEqual(['same-id', 'later-id']);
    expect(result.recommendedBuildingId).toBe('b');
  });
});
