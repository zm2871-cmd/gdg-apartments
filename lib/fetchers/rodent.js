import { normalizeBbl } from '../bbl.js';
import { shouldDropIssue } from '../cleaning-rules.js';
import { rodentInspectionSchema } from '../schemas.js';
import { querySocrata } from '../socrata.js';
import { cutoff, dataset_ids, time_windows } from '../sources.js';

// Real inspections. Treatments (bait, monitoring), Stoppage and Clean Ups are work visits, not inspections.
const INSPECTION_TYPES = new Set(['Initial', 'Compliance']);

/** Severity of a failed inspection, or null if the result isn't a failure. */
function severityOf(result) {
  if (result.startsWith('Failed for Rat Activity')) return 3; // with or without "and Other Reason"
  if (result.startsWith('Failed')) return 1;                  // "Failed for Other Reason"
  return null;
}

const toNumber = (value) => (value == null ? undefined : Number(value));

/**
 * Rodent inspection failures from the last 2 years. One issue per failed inspection; a failure is
 * closed once a later inspection in the same job (job_id) passes.
 * @param {import('../schemas.js').BuildingRef} building
 * @returns {Promise<{ issues: import('../schemas.js').Issue[], latestRecordAt: string | null }>}
 */
export async function fetchIssues(building) {
  const bbl = normalizeBbl(building.bbl);
  if (!bbl) throw new Error(`rodent: invalid BBL ${JSON.stringify(building.bbl)}`);

  // Many rows have no bbl, so also match borough, block and lot. Block and lot are unpadded text ("1629", "1").
  const boro = bbl[0], block = String(Number(bbl.slice(1, 6))), lot = String(Number(bbl.slice(6)));
  const rows = await querySocrata(dataset_ids.rodent_inspections, {
    where: `(bbl = ${bbl} OR (boro_code = ${boro} AND block = '${block}' AND lot = '${lot}')) AND inspection_date >= '${cutoff(time_windows.rodent_inspections.months)}'`,
    order: 'inspection_date DESC, :id',
  });

  const inspections = rows
    .map((raw) => ({ raw, v: rodentInspectionSchema.parse(raw) }))
    .filter(({ v }) => INSPECTION_TYPES.has(v.inspection_type));

  // Latest pass per job: any failure in that job before it is closed.
  const lastPassByJob = new Map();
  for (const { v } of inspections) {
    if (v.result === 'Passed' && v.inspection_date > (lastPassByJob.get(v.job_id) ?? '')) lastPassByJob.set(v.job_id, v.inspection_date);
  }

  const issues = inspections.flatMap(({ raw, v }) => {
    const severity = severityOf(v.result);
    if (!severity) return [];
    const lastPass = lastPassByJob.get(v.job_id);
    return [{
      source: 'rodent',
      sourceId: `${v.job_id}|${v.inspection_date ?? ''}`, // job_id alone isn't unique: one job has many inspections
      bbl: normalizeBbl(v.bbl), // rows found by block and lot keep their own (often null) bbl
      category: 'pests',
      severity,
      status: lastPass && lastPass > (v.inspection_date ?? '') ? 'closed' : 'open',
      observedAt: v.inspection_date ?? null,
      description: `${v.inspection_type} inspection: ${v.result}`,
      lat: toNumber(v.latitude),
      lon: toNumber(v.longitude),
      raw,
    }];
  }).filter((issue) => !shouldDropIssue(issue));

  // Passes count toward latestRecordAt; bait and other work visits don't.
  const dates = inspections.map(({ v }) => v.inspection_date).filter(Boolean).sort();
  return { issues, latestRecordAt: dates.at(-1) ?? null };
}
