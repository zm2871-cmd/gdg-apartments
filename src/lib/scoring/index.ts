import { categories, labels, type Category, type Evidence, type Report, type Score } from '../domain';
import { sourceNames } from '../nyc/client';

export const SCORING_CONFIG = {
  version: 'v0.1-pilot',
  minimumCohort: 100,
  reliability: { violation: 1, inspection: 1, filing: .65, complaint: .25 },
  thresholds: [20, 40, 60, 80, 100],
  // Shortlist ranking. A category only affects the order when the gap is meaningful:
  // at least this many weighted records (per 100 units, or nearby within 200 m)...
  minimumGap: { per_100_units: 1, nearby_200m: 5 },
  // ...and the larger value is at least this many times the smaller one.
  minimumRatio: 1.5,
  // Buildings whose overall scores (0 to 1) differ by less than this are too close to call.
  overallMargin: .1,
  // Below this share of the renter's priority weight, no building is recommended.
  minimumPriorityShare: .5,
  // Shortlist grades: the 0-1 score split into five even bands (A best, F worst).
  shortlistGrades: ['A', 'B', 'C', 'D', 'F'],
} as const;

export type ShortlistGrade = typeof SCORING_CONFIG.shortlistGrades[number];

/** Letter for a 0-1 shortlist score: under 0.2 is A, 0.2 to under 0.4 is B, and so on; 0.8 and above is F. */
export function shortlistGrade(score: number): ShortlistGrade {
  const grades = SCORING_CONFIG.shortlistGrades;
  return grades[Math.min(grades.length - 1, Math.floor(score * grades.length + 1e-9))];
}

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
  // True when the buildings differ too little for this category to affect the order.
  close: boolean;
  // share: this building's value divided by the worst in the shortlist (0-1), and its grade.
  // Both are null when the category did not affect the order (not comparable, about the same, or zero priority).
  values: { id: string; burden: number | null; evidenceIds: string[]; share?: number | null; grade?: ShortlistGrade | null }[];
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
    category, comparable: false, reason: limitations.join(' '), sources, measure: null, close: false,
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
  const measure = isNearby ? 'nearby_200m' as const : 'per_100_units' as const;
  const close = isClose(values.map(value => value.burden!), measure);
  const reason = [
    ...limitations,
    weight === 0 ? 'Your priority weight is zero, so this category does not affect the order.' : '',
    values.every(value => value.burden === 0)
      ? 'No positive records were returned from the included sources; this does not establish that conditions are problem-free.'
      : close ? 'About the same across this shortlist: the difference is too small to affect the order.' : '',
  ].filter(Boolean).join(' ') || null;
  return { category, comparable: true, reason, sources, measure, close, values };
}

function isClose(burdens: number[], measure: 'per_100_units' | 'nearby_200m') {
  const max = Math.max(...burdens), min = Math.min(...burdens);
  return max - min < SCORING_CONFIG.minimumGap[measure] || (min > 0 && max < min * SCORING_CONFIG.minimumRatio);
}

function compareLive(reports: Report[], weights: Record<Category, number>, now = new Date()) {
  const categoryDetails = categories.map(category => shortlistCategory(reports, category, weights[category], now));
  const common = categoryDetails.filter(detail => detail.comparable).map(detail => detail.category);
  const missing = categories.filter(category => !common.includes(category));
  const selected = categoryDetails.filter(detail => detail.comparable && weights[detail.category] > 0);
  // Only categories with a meaningful gap decide the order.
  const decisive = selected.filter(detail => !detail.close);
  const decisiveWeight = decisive.reduce((sum, detail) => sum + weights[detail.category], 0);
  // Each building's share of the worst value in the shortlist (0 to 1), so the size of a gap counts, not just who is ahead.
  const graded = categoryDetails.map(detail => {
    if (!decisive.includes(detail)) return { ...detail, values: detail.values.map(row => ({ ...row, share: null, grade: null })) };
    const max = Math.max(...detail.values.map(row => row.burden as number));
    return { ...detail, values: detail.values.map(row => {
      const share = round(row.burden as number / max);
      return { ...row, share, grade: shortlistGrade(share) };
    }) };
  });
  const ranked = reports.map(report => {
    if (!decisiveWeight) return { id: report.identity.id, value: null };
    const value = graded.filter(detail => detail.values[0].share !== null).reduce((sum, detail) =>
      sum + weights[detail.category] * detail.values.find(row => row.id === report.identity.id)!.share!, 0) / decisiveWeight;
    return { id: report.identity.id, value: round(value) };
  });

  const totalWeight = categories.reduce((sum, category) => sum + weights[category], 0);
  const usedWeight = selected.reduce((sum, detail) => sum + weights[detail.category], 0);
  const priorities = {
    usedWeight, totalWeight,
    share: totalWeight ? round(usedWeight / totalWeight) : 0,
    excluded: categories.filter(category => weights[category] > 0 && !common.includes(category)),
  };
  const enoughPriorities = priorities.share >= SCORING_CONFIG.minimumPriorityShare;

  const order = ranked.filter(row => row.value !== null).sort((a, b) => a.value! - b.value!);
  const clearWinner = order.length > 1 && order[1].value! - order[0].value! >= SCORING_CONFIG.overallMargin;
  const anyRecords = selected.some(detail => detail.values.some(value => (value.burden ?? 0) > 0));
  const status = !enoughPriorities ? 'insufficient_evidence'
    : decisiveWeight === 0 ? anyRecords ? 'tied' : 'insufficient_evidence'
      : clearWinner ? 'ranked' : 'tied';
  const percent = Math.round(priorities.share * 100);
  const reason = !enoughPriorities
    ? `Only ${percent}% of your priority weight could be compared fairly${priorities.excluded.length ? ` (left out: ${priorities.excluded.map(category => labels[category]).join(', ')})` : ''}. That is too little to recommend a building. Missing records do not prove a building is problem-free.`
    : status === 'ranked'
      ? 'Relative order uses only comparable official records for these selected buildings, and larger gaps count more than small ones. Lower points mean fewer weighted recorded signals within this shortlist, not a citywide grade or a prediction of safety.'
      : status === 'tied'
        ? 'The selected buildings are too close to call on comparable records after applying your priorities. No single building is recommended.'
        : 'There are not enough comparable, informative records to order these buildings. Missing records do not prove a building is problem-free.';
  return {
    method: 'relative_shortlist' as const,
    details: { status, reason, priorities, categories: graded },
    // Overall shortlist grade, withheld when too little of the renter's priorities could be compared.
    ranked: ranked.map(row => ({ ...row, grade: row.value === null || status === 'insufficient_evidence' ? null : shortlistGrade(row.value) })),
    common,
    missing,
    recommendedBuildingId: status === 'ranked' ? order[0].id : null,
  };
}

function compareSynthetic(reports: Report[], weights: Record<Category, number>) {
  const common = categories.filter(category =>
    reports.length >= 2 && reports.every(report => report.scores.find(score => score.category === category)?.percentile != null));
  const total = common.reduce((sum, category) => sum + weights[category], 0);
  const ranked = reports.map(report => ({ id: report.identity.id, grade: null,
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
