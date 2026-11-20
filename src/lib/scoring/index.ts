import { categories, type Category, type Evidence, type Report, type Score } from '../domain';
import { sourceNames } from '../nyc/client';

export const SCORING_CONFIG = {
  version: 'v0.1-pilot',
  minimumCohort: 100,
  reliability: { violation: 1, inspection: 1, filing: .65, complaint: .25 },
  thresholds: [20, 40, 60, 80, 100],
} as const;

export function groupKey(e: Evidence) {
  return e.kind === 'complaint'
    ? `${e.category}:${e.scope}:${e.analysisKey ?? e.description.toLowerCase()}:${new Date(e.date).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })}`
    : e.id;
}

function contributingRecords(events: Evidence[], now: Date) {
  const seen = new Set<string>();
  return events.filter(event => {
    const age = (+now - Date.parse(event.date)) / 86400000;
    if (!event.positive || !Number.isFinite(age) || age < 0) return false;
    const key = groupKey(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function contribution(event: Evidence, now: Date) {
  const age = (+now - Date.parse(event.date)) / 86400000;
  const recency = age <= 365 ? 1 : age <= 1095 ? .35 : .1;
  const resolved = event.kind === 'violation' && /^(close|closed|resolved)$/i.test(event.status);
  return event.severity * SCORING_CONFIG.reliability[event.kind] * recency * (resolved ? .3 : 1);
}

export function burden(events: Evidence[], now = new Date()) {
  return contributingRecords(events, now).reduce((sum, event) => sum + contribution(event, now), 0);
}

export function score(records: Evidence[], eligible = false, baseline?: number[], now = new Date()): Score[] {
  return categories.map(category => {
    const events = records.filter(event => event.category === category);
    const value = burden(events, now);
    const ready = eligible && events.some(event => event.kind !== 'complaint') && baseline && baseline.length >= SCORING_CONFIG.minimumCohort;
    const percentile = ready ? 100 * baseline.filter(number => number < value).length / baseline.length : null;
    return {
      category,
      burden: Math.round(value * 100) / 100,
      count: events.length,
      percentile,
      grade: percentile === null ? null : ['A', 'B', 'C', 'D', 'F'][Math.min(4, Math.floor(percentile / 20))],
      explanation: ready
        ? 'Synthetic calibrated cohort; illustrative only.'
        : 'Not yet graded: insufficient comparable baseline. Missing records do not establish low risk.',
    };
  });
}

const sourcesByCategory: Record<Category, string[]> = {
  pests: [sourceNames.violations, sourceNames.rodents, sourceNames.requests],
  bedbugs: [sourceNames.bedbugs],
  heat: [sourceNames.violations, sourceNames.requests],
  maintenance: [sourceNames.violations, sourceNames.requests],
  noise: [sourceNames.noise],
};

type CategoryDetail = {
  category: Category;
  comparable: boolean;
  reason: string | null;
  sources: string[];
  measure: 'per_100_units' | 'nearby_200m' | null;
  values: { id: string; burden: number | null; evidenceIds: string[] }[];
};

const round = (value: number) => Math.round(value * 10000) / 10000;

function hasReliableBuildingSize(report: Report) {
  const { confidence, lotBuildings, lotUnits } = report.identity;
  return confidence === 'building' && lotBuildings === 1 &&
    typeof lotUnits === 'number' && Number.isFinite(lotUnits) && lotUnits > 0;
}

function shortlistCategory(reports: Report[], category: Category, weight: number, now: Date): CategoryDetail {
  const expected = sourcesByCategory[category];
  const sources = expected.filter(source => reports.every(report =>
    report.coverage.some(coverage => coverage.source === source && coverage.status === 'ok')));
  const omitted = expected.filter(source => !sources.includes(source));
  const isNearby = category === 'noise';
  const missingSources = sources.length === 0;
  const unreliableSize = !isNearby && reports.some(report => !hasReliableBuildingSize(report));
  const uncertainMatch = isNearby && reports.some(report => ['unverified', 'ambiguous'].includes(report.identity.confidence));
  const limitations: string[] = [];
  if (missingSources) limitations.push('No relevant official source has complete coverage for every selected building.');
  if (unreliableSize) {
    limitations.push('At least one building lacks a confirmed single-building match and residential unit count, so recorded issue rates cannot be compared fairly.');
  }
  if (uncertainMatch) {
    limitations.push('At least one address match is uncertain, so nearby records cannot be compared reliably.');
  }
  if (omitted.length) limitations.push(`Excluded incomplete sources: ${omitted.join(', ')}.`);
  const comparable = !missingSources && !unreliableSize && !uncertainMatch;
  if (!comparable) return {
    category, comparable: false, reason: limitations.join(' '), sources, measure: null,
    values: reports.map(report => ({ id: report.identity.id, burden: null, evidenceIds: [] })),
  };

  const values = reports.map(report => {
    const events = contributingRecords(report.records.filter(record =>
      record.category === category && sources.includes(record.source) &&
      (isNearby ? record.scope === 'nearby' : record.scope === 'building' || record.scope === 'tax_lot')),
    now);
    const amount = events.reduce((sum, event) => sum + contribution(event, now), 0);
    return {
      id: report.identity.id,
      burden: round(isNearby ? amount : amount * 100 / report.identity.lotUnits!),
      evidenceIds: events.map(event => event.id),
    };
  });
  const reason = [
    ...limitations,
    weight === 0 ? 'Your priority weight is zero, so this category does not affect the order.' : '',
    values.every(value => value.burden === 0)
      ? 'No positive records were returned from the included sources; this does not establish that conditions are problem-free.' : '',
  ].filter(Boolean).join(' ') || null;
  return { category, comparable: true, reason, sources,
    measure: isNearby ? 'nearby_200m' : 'per_100_units', values };
}

function compareLive(reports: Report[], weights: Record<Category, number>, now = new Date()) {
  const categoryDetails = categories.map(category => shortlistCategory(reports, category, weights[category], now));
  const common = categoryDetails.filter(detail => detail.comparable).map(detail => detail.category);
  const missing = categories.filter(category => !common.includes(category));
  const selected = categoryDetails.filter(detail => detail.comparable && weights[detail.category] > 0);
  const informative = selected.filter(detail =>
    new Set(detail.values.map(value => value.burden)).size > 1);
  const totalWeight = informative.reduce((sum, detail) => sum + weights[detail.category], 0);
  const ranked = reports.map(report => {
    if (!totalWeight) return { id: report.identity.id, value: null };
    const value = informative.reduce((sum, detail) => {
      const unique = [...new Set(detail.values.map(row => row.burden as number))].sort((a, b) => a - b);
      const buildingValue = detail.values.find(row => row.id === report.identity.id)!.burden as number;
      return sum + weights[detail.category] * unique.indexOf(buildingValue) / (unique.length - 1);
    }, 0) / totalWeight;
    return { id: report.identity.id, value: round(value) };
  });
  const minimum = Math.min(...ranked.map(row => row.value ?? Infinity));
  const winners = ranked.filter(row => row.value !== null && Math.abs(row.value - minimum) < .0001);
  const status = totalWeight === 0
    ? selected.some(detail => detail.values.some(value => (value.burden ?? 0) > 0)) ? 'tied' : 'insufficient_evidence'
    : winners.length === 1 ? 'ranked' : 'tied';
  const reason = status === 'ranked'
    ? 'Relative order uses only comparable official records for these selected buildings. Lower points mean fewer weighted recorded signals within this shortlist, not a citywide grade or a prediction of safety.'
    : status === 'tied'
      ? 'The selected buildings tie on comparable records after applying your priorities. No single building is recommended.'
      : 'There are not enough comparable, informative records to order these buildings. Missing records do not prove a building is problem-free.';
  return {
    method: 'relative_shortlist' as const,
    details: { status, reason, categories: categoryDetails },
    ranked,
    common,
    missing,
    recommendedBuildingId: status === 'ranked' ? winners[0].id : null,
  };
}

function compareSynthetic(reports: Report[], weights: Record<Category, number>) {
  const common = categories.filter(category =>
    reports.length >= 2 && reports.every(report => report.scores.find(score => score.category === category)?.percentile != null));
  const total = common.reduce((sum, category) => sum + weights[category], 0);
  const ranked = reports.map(report => ({ id: report.identity.id,
    value: total ? common.reduce((sum, category) =>
      sum + report.scores.find(score => score.category === category)!.percentile! * weights[category], 0) / total : null }));
  return {
    method: 'synthetic_percentile' as const,
    details: null,
    ranked,
    common,
    missing: categories.filter(category => !common.includes(category)),
    recommendedBuildingId: total ? [...ranked].sort((a, b) => a.value! - b.value!)[0].id : null,
  };
}

export function compare(reports: Report[], weights: Record<Category, number>, now = new Date()) {
  return reports.length > 0 && reports.every(report => !report.demo)
    ? compareLive(reports, weights, now)
    : compareSynthetic(reports, weights);
}
