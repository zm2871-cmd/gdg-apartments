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
