import { normalizeBbl } from '../bbl.js';
import { shouldDropIssue } from '../cleaning-rules.js';
import { bedbugFilingSchema } from '../schemas.js';
import { querySocrata } from '../socrata.js';
import { dataset_ids, time_windows } from '../sources.js';

const toNumber = (value) => (value == null ? undefined : Number(value));

/**
 * End date of the filing period (Nov 1 – Oct 31) a filing covers, as "YYYY-MM-DD".
 * 129 rows citywide have no period: a filing in Nov/Dec of year Y covers the period ending Oct Y,
 * one in Jan–Oct covers the period ending Oct Y-1 (late filings are common).
 */
function periodEndOf(v) {
  if (v.filling_period_end_date) return v.filling_period_end_date.slice(0, 10);
  const year = Number(v.filing_date.slice(0, 4)), month = Number(v.filing_date.slice(5, 7));
  return `${month >= 11 ? year : year - 1}-10-31`;
}

function severityOf(infested, eradicated, reinfested) {
  if (reinfested > 0) return 3;
  if (infested > eradicated) return 2; // some infested units remain
  return 1;                            // all eradicated
}

/** @returns {import('../schemas.js').Issue | null} */
function toIssue({ raw, v }) {
  const units = Number(v.of_dwelling_units);
  const infested = Number(v.infested_dwelling_unit_count);
  const eradicated = Number(v.eradicated_unit_count ?? 0);
  const reinfested = Number(v.re_infested_dwelling_unit ?? 0);
  if (!(infested > 0)) return null; // reported zero: no issue, but the filing still counts toward latestRecordAt

  return {
    source: 'bedbug',
    // Not unique on its own: citywide, identical rows repeat up to 18 times. Only one row per building per period is kept.
    sourceId: [v.building_id, v.registration_id, v.filing_date, v.filling_period_end_date ?? ''].join('|'),
    bbl: normalizeBbl(v.bbl),
    category: 'bedbugs',
    severity: severityOf(infested, eradicated, reinfested),
    status: infested > eradicated ? 'open' : 'closed',
    observedAt: v.filing_date,
    description: `${infested} of ${units} units infested, ${eradicated} eradicated` + (reinfested > 0 ? `, ${reinfested} re-infested` : ''),
    lat: toNumber(v.latitude),
    lon: toNumber(v.longitude),
    raw, // keeps the unit counts for per-unit grading
  };
}

/**
 * Bedbug filings from the lot's latest filing periods, newest filing per building per period.
 * @param {import('../schemas.js').BuildingRef} building
 * @returns {Promise<{ issues: import('../schemas.js').Issue[], latestRecordAt: string | null }>}
 */
export async function fetchIssues(building) {
  const bbl = normalizeBbl(building.bbl);
  if (!bbl) throw new Error(`bedbug: invalid BBL ${JSON.stringify(building.bbl)}`);

  // Few rows per lot (one per building per year), so fetch them all and pick the periods in code.
  const rows = await querySocrata(dataset_ids.bedbug_filings, { where: `bbl = '${bbl}'`, order: ':id' });
  const filings = rows.map((raw) => {
    const v = bedbugFilingSchema.parse(raw);
    return { raw, v, period: periodEndOf(v) };
  });

  // The latest N periods across the whole lot, so a building that stopped filing shows nothing recent.
  const periods = [...new Set(filings.map((f) => f.period))].sort().slice(-time_windows.bedbug_filings.filing_years);

  // Newest filing per building per period; this also collapses exact duplicate rows.
  const newest = new Map();
  for (const f of filings) {
    if (!periods.includes(f.period)) continue;
    const key = `${f.v.building_id}|${f.period}`;
    if (!newest.has(key) || f.v.filing_date > newest.get(key).v.filing_date) newest.set(key, f);
  }

  const issues = [...newest.values()].map(toIssue).filter((issue) => issue && !shouldDropIssue(issue));
  const dates = filings.map((f) => f.v.filing_date).sort();
  return { issues, latestRecordAt: dates.at(-1) ?? null };
}
