import { normalizeBbl } from './bbl.js';
import { issueSchema } from './schemas.js';

/** EWKT point for a geography column, longitude first; null when either coordinate is missing. */
export function toEwkt(lat, lon) {
  if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return null;
  return `SRID=4326;POINT(${Number(lon)} ${Number(lat)})`;
}

/**
 * Validates an Issue and converts it to an `issues` table row.
 * Invalid BBLs ("0", "0000000000") become null rather than failing the row.
 * @param {import('./schemas.js').Issue} issue
 */
export function toIssueRow(issue) {
  const valid = issueSchema.parse({ ...issue, bbl: normalizeBbl(issue.bbl) });
  return {
    source: valid.source,
    source_id: valid.sourceId,
    bbl: valid.bbl,
    category: valid.category,
    severity: valid.severity,
    status: valid.status,
    observed_at: valid.observedAt,
    description: valid.description,
    geom: toEwkt(valid.lat, valid.lon),
    raw: valid.raw,
  };
}
