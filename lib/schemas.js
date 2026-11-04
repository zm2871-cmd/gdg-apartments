// Zod schemas for raw source responses. They list only the fields the code uses;
// z.object ignores unknown keys, so new upstream columns don't break anything.
// Socrata returns every value as a string and omits empty fields entirely.
import { z } from 'zod';

const text = z.string();
const maybe = z.string().optional();
const timestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // no zone: NYC wall-clock
const maybeTimestamp = timestamp.optional();
const number = z.string().regex(/^-?\d+(\.\d+)?$/);
const maybeNumber = number.optional();

export const hpdViolationSchema = z.object({
  violationid: text,
  bbl: maybe,
  bin: maybe,
  buildingid: maybe,
  inspectiondate: maybeTimestamp, // DATA-08 falls back to novissueddate
  novissueddate: maybeTimestamp,
  class: text,
  novdescription: text,
  violationstatus: z.enum(['Open', 'Close']),
  currentstatus: maybe,
});

export const hpdComplaintSchema = z.object({
  problem_id: number,
  bbl: maybeNumber,
  bin: maybeNumber,
  building_id: maybeNumber,
  received_date: timestamp,
  problem_duplicate_flag: maybe,
  major_category: text,
  minor_category: maybe,
  problem_code: maybe,
  problem_status: text,
  complaint_status: maybe,
});

export const rodentInspectionSchema = z.object({
  job_id: text,
  bbl: maybeNumber, // often missing citywide; DATA-10 matches on boro_code, block and lot
  boro_code: number,
  block: maybe,
  lot: maybe,
  inspection_date: maybeTimestamp,
  inspection_type: text,
  result: text,
  latitude: maybeNumber,
  longitude: maybeNumber,
});

export const bedbugFilingSchema = z.object({
  building_id: text,
  registration_id: text,
  bbl: maybe,
  filing_date: timestamp,
  filing_period_start_date: maybeTimestamp,
  filling_period_end_date: maybeTimestamp, // misspelled upstream
  infested_dwelling_unit_count: number,
  of_dwelling_units: number,
  eradicated_unit_count: maybeNumber,
  re_infested_dwelling_unit: maybeNumber,
});

export const threeOneOneRequestSchema = z.object({
  unique_key: text,
  bbl: maybe, // null for complaints without a building address
  created_date: timestamp,
  complaint_type: text,
  descriptor: maybe,
  status: text,
  resolution_description: maybe,
  latitude: maybeNumber,
  longitude: maybeNumber,
});

export const plutoSchema = z.object({
  bbl: number, // "4087860042.00000000": normalize before joining (DATA-06)
  address: maybe,
  unitsres: maybeNumber,
  yearbuilt: maybeNumber,
});

export const geosearchSchema = z.object({
  features: z.array(z.object({
    geometry: z.object({ coordinates: z.tuple([z.number(), z.number()]) }), // [lon, lat]
    properties: z.object({
      label: text,
      borough: maybe,
      addendum: z.object({ pad: z.object({ bbl: maybe, bin: maybe }).optional() }).optional(),
    }),
  })),
});

// One schema per Socrata source, keyed like dataset_ids in lib/sources.js.
export const rowSchemas = {
  hpd_violations: hpdViolationSchema,
  hpd_complaints: hpdComplaintSchema,
  rodent_inspections: rodentInspectionSchema,
  bedbug_filings: bedbugFilingSchema,
  three_one_one_requests: threeOneOneRequestSchema,
  pluto: plutoSchema,
};

/**
 * The common shape every fetcher returns (spec §5.2, with the plan's decisions applied:
 * no distanceM, 311 rows keep their own bbl, and the source row is kept in raw).
 * Shared with the frontend so it can build against mock data.
 *
 * @typedef {Object} Issue
 * @property {'hpd_violation'|'hpd_complaint'|'rodent'|'bedbug'|'311'} source
 * @property {string} sourceId         original record ID, for dedupe
 * @property {string|null} bbl          10-digit BBL; null when the source has none
 * @property {'repairs'|'heat'|'pests'|'bedbugs'|'noise'} category
 * @property {1|2|3} severity
 * @property {'open'|'closed'} status
 * @property {string|null} observedAt   NYC wall-clock time with no zone, e.g. "2026-10-31T02:53:39.000"
 * @property {string} description       short, human-readable
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {Record<string, unknown>} raw  the source row as received
 */
export const issueSchema = z.object({
  source: z.enum(['hpd_violation', 'hpd_complaint', 'rodent', 'bedbug', '311']),
  sourceId: z.string().min(1),
  bbl: z.string().regex(/^[1-5]\d{9}$/).nullable(),
  category: z.enum(['repairs', 'heat', 'pests', 'bedbugs', 'noise']),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(['open', 'closed']),
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/).nullable(), // a zone suffix is rejected
  description: z.string().min(1),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  raw: z.record(z.string(), z.unknown()),
});

/**
  * What every fetcher needs to know about the searched building.
  * @typedef {Object} BuildingRef
  * @property {string} bbl        10-digit, already normalized
  * @property {string|null} bin
  * @property {number} lat
  * @property {number} lon
  */
export const buildingRefSchema = z.object({
  bbl: z.string().regex(/^[1-5]\d{9}$/),         // every fetcher needs it
  bin: z.string().regex(/^[1-5]\d{6}$/).nullable(), // BINs are 7 digits, e.g. "3065755"
  lat: z.number().min(-90).max(90),               // the 311 fetcher needs both coordinates
  lon: z.number().min(-180).max(180),
});
