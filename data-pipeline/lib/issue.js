import { normalizeBbl } from './bbl.js';
import { issueSchema } from './schemas.js';

/** EWKT point for a geography column, longitude first; null when either coordinate is missing. */
export function toEwkt(lat, lon) {
  if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) return null;
  return `SRID=4326;POINT(${Number(lon)} ${Number(lat)})`;
}

/** Reads [lon, lat] from a PostGIS point as returned by Supabase ("0101000020E6100000…"). */
export function fromEwkbHex (hex) {
  const bytes = Buffer.from(hex, 'hex');
  if (bytes.length !== 25 || bytes[0] !== 1) throw new Error(`Unexpected geom: ${hex}`);
  return {
    lon: bytes.readDoubleLE(9),
    lat: bytes.readDoubleLE(17)
  };
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

/**
 * Converts an `issues` table row (or an issues_near row) back to the Issue shape, with distanceM when present.
 * @returns {import('./schemas.js').Issue & { distanceM?: number }}
 */
export function fromIssueRow(row) {
  const point = row.geom ? fromEwkbHex(row.geom) : null;
  return {
    source: row.source,
    sourceId: row.source_id,
    bbl: row.bbl,
    category: row.category,
    severity: row.severity,
    status: row.status,
    observedAt: row.observed_at,
    description: row.description,
    ...(point && { lat: point.lat, lon: point.lon }),
    ...(row.distance_m != null && { distanceM: row.distance_m }),
    raw: row.raw,
  };
}
