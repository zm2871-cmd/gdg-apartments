import { normalizeBbl } from '../bbl.js';
import { isExcluded311, shouldDropIssue } from '../cleaning-rules.js';
import { threeOneOneRequestSchema } from '../schemas.js';
import { querySocrata } from '../socrata.js';
import { cutoff, dataset_ids, three_one_one_search_radius, time_windows } from '../sources.js';

const toNumber = (value) => (value == null ? undefined : Number(value));

/** @returns {import('../schemas.js').Issue | null} */
function toIssue(row) {
  const v = threeOneOneRequestSchema.parse(row);
  if (!v.complaint_type.startsWith('Noise') || isExcluded311(v)) return null; // 311 supplies noise only (plan decision 8)

  return {
    source: '311',
    sourceId: v.unique_key,
    bbl: normalizeBbl(v.bbl), // the row's own BBL: rows are shared between nearby buildings (plan decision 4)
    category: 'noise',
    severity: 1,
    status: v.status === 'Closed' ? 'closed' : 'open', // In Progress, Unspecified, Started, Assigned, Open
    observedAt: v.created_date,
    description: [v.complaint_type, v.descriptor].filter(Boolean).join(': '),
    lat: toNumber(v.latitude),
    lon: toNumber(v.longitude),
    raw: row,
  };
}

/**
 * 311 noise complaints within the search radius of the building over the last 12 months.
 * @param {import('../schemas.js').BuildingRef} building
 * @returns {Promise<{ issues: import('../schemas.js').Issue[], latestRecordAt: string | null }>}
 */
export async function fetchIssues(building) {
  // The coordinates go into the query text, so only finite numbers in range are allowed.
  // null and '' are checked first because Number(null) and Number('') are 0.
  const valid = (value, max) => value != null && value !== '' && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max;
  if (!valid(building.lat, 90) || !valid(building.lon, 180)) {
    throw new Error(`311: invalid coordinates ${JSON.stringify([building.lat, building.lon])}`);
  }
  const lat = Number(building.lat), lon = Number(building.lon);

  const rows = await querySocrata(dataset_ids.three_one_one_requests, {
    where: `within_circle(location, ${lat}, ${lon}, ${three_one_one_search_radius.meters}) AND created_date >= '${cutoff(time_windows.three_one_one_requests.months)}' AND complaint_type like 'Noise%'`,
    order: 'created_date DESC, unique_key',
  });

  // Excluded noise rows still count toward latestRecordAt.
  const dates = rows.filter((r) => r.complaint_type?.startsWith('Noise')).map((r) => r.created_date).filter(Boolean).sort();
  const issues = rows.map(toIssue).filter((issue) => issue && !shouldDropIssue(issue));
  return { issues, latestRecordAt: dates.at(-1) ?? null };
}
