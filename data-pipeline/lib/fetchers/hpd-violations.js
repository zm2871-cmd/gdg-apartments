import { normalizeBbl } from '../bbl.js';
import { hpdHeatPattern, hpdPestPattern, shouldDropIssue } from '../cleaning-rules.js';
import { hpdViolationSchema } from '../schemas.js';
import { querySocrata } from '../socrata.js';
import { cutoff, dataset_ids, time_windows } from '../sources.js';

const SEVERITY = { A: 1, B: 2, C: 3 }; // class I (administrative, e.g. missing registration) has no entry and is dropped

/** @returns {import('../schemas.js').Issue | null} */
function toIssue(row) {
  const v = hpdViolationSchema.parse(row);
  const severity = SEVERITY[v.class];
  if (!severity) return null;

  return {
    source: 'hpd_violation',
    sourceId: v.violationid,
    bbl: v.bbl ?? null,
    category: hpdPestPattern.test(v.novdescription) ? 'pests'
      : hpdHeatPattern.test(v.novdescription) ? 'heat'
      : 'repairs',
    severity,
    status: v.violationstatus === 'Open' ? 'open' : 'closed',
    observedAt: v.inspectiondate ?? v.novissueddate ?? null,
    description: v.novdescription,
    raw: row, // the unparsed row: parse() strips fields the schema doesn't list
  };
}

/**
 * HPD violations from the last 3 years, plus every violation still open.
 * @param {import('../schemas.js').BuildingRef} building
 * @returns {Promise<{ issues: import('../schemas.js').Issue[], latestRecordAt: string | null }>}
 */
export async function fetchIssues(building) {
  const bbl = normalizeBbl(building.bbl);
  if (!bbl) throw new Error(`hpd_violations: invalid BBL ${JSON.stringify(building.bbl)}`);

  const rows = await querySocrata(dataset_ids.hpd_violations, {
    where: `bbl = '${bbl}' AND (inspectiondate >= '${cutoff(time_windows.hpd_violations.months)}' OR violationstatus = 'Open')`,
    order: 'inspectiondate DESC, violationid',
  });

  // Every row counts toward latestRecordAt, including dropped ones, so "no violations" differs from "never fetched".
  const dates = rows.map((r) => r.inspectiondate ?? r.novissueddate).filter(Boolean).sort();
  const issues = rows.map(toIssue).filter((issue) => issue && !shouldDropIssue(issue));
  return { issues, latestRecordAt: dates.at(-1) ?? null };
}
