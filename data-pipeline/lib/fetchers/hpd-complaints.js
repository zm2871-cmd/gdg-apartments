import { normalizeBbl } from '../bbl.js';
import { shouldDropIssue } from '../cleaning-rules.js';
import { hpdComplaintSchema } from '../schemas.js';
import { querySocrata } from '../socrata.js';
import { cutoff, dataset_ids, time_windows } from '../sources.js';

/** Category from HPD's own fields; mold and everything unlisted are repairs. */
function categoryOf({ major_category, minor_category }) {
  if (major_category === 'HEAT/HOT WATER') return 'heat';
  if (major_category === 'UNSANITARY CONDITION' && minor_category === 'PESTS') return 'pests';
  return 'repairs';
}

const toNumber = (value) => (value == null ? undefined : Number(value));

/** @returns {import('../schemas.js').Issue | null} */
function toIssue(row) {
  const v = hpdComplaintSchema.parse(row);
  if (v.problem_duplicate_flag === 'Y') return null; // HPD flagged it as a duplicate of another problem

  return {
    source: 'hpd_complaint',
    sourceId: v.problem_id, // unique_key isn't unique in this dataset
    bbl: v.bbl ?? null,
    category: categoryOf(v),
    severity: 1, // the spec only defines severity for violation classes; grading may tune this
    status: v.problem_status === 'OPEN' ? 'open' : 'closed',
    observedAt: v.received_date,
    // e.g. "HEAT/HOT WATER: APARTMENT ONLY: NO HEAT"; mold rows have problem_code "N/A"
    description: [v.major_category, v.minor_category, v.problem_code].filter((part) => part && part !== 'N/A').join(': '),
    lat: toNumber(v.latitude),
    lon: toNumber(v.longitude),
    raw: row, // the unparsed row: parse() strips fields the schema doesn't list
  };
}

/**
 * HPD complaints from the last 12 months, without flagged duplicates.
 * @param {import('../schemas.js').BuildingRef} building
 * @returns {Promise<{ issues: import('../schemas.js').Issue[], latestRecordAt: string | null }>}
 */
export async function fetchIssues(building) {
  const bbl = normalizeBbl(building.bbl);
  if (!bbl) throw new Error(`hpd_complaints: invalid BBL ${JSON.stringify(building.bbl)}`);

  const rows = await querySocrata(dataset_ids.hpd_complaints, {
    where: `bbl = ${bbl} AND received_date >= '${cutoff(time_windows.hpd_complaints.months)}'`, // bbl is a number field here: no quotes
    order: ':id',
  });

  // Duplicates are dropped as issues but still count toward latestRecordAt.
  const dates = rows.map((r) => r.received_date).filter(Boolean).sort();
  const issues = rows.map(toIssue).filter((issue) => issue && !shouldDropIssue(issue));
  return { issues, latestRecordAt: dates.at(-1) ?? null };
}
