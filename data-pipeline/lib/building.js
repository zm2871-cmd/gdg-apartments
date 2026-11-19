import { normalizeBbl } from './bbl.js';
import { toEwkt } from './issue.js';
import { plutoSchema } from './schemas.js';
import { querySocrata } from './socrata.js';
import { dataset_ids } from './sources.js';

const toInt = (value) => (value == null ? null : Math.trunc(Number(value)));

// Looks up a searchAddress() match in PLUTO and upserts it into buildings. Returns the saved row.
// `db` is a Supabase client with write access (secret key).
export async function resolveBuilding(match, db) {
  const bbl = normalizeBbl(match.bbl);
  if (!bbl) throw new Error(`resolveBuilding: invalid BBL ${JSON.stringify(match.bbl)}`);

  // bbl is 10 validated digits, so it's safe in the query; PLUTO's bbl is a number field.
  const [row] = await querySocrata(dataset_ids.pluto, { select: 'bbl, unitsres, yearbuilt', where: `bbl = ${bbl}`, order: 'bbl' });
  const pluto = row ? plutoSchema.parse(row) : null; // a PLUTO miss stores nulls; grading handles it

  const building = {
    bbl,
    bin: match.bin ?? null,
    address: match.label,
    borough: match.borough,
    geom: toEwkt(match.lat, match.lon),
    units_res: toInt(pluto?.unitsres), // 0 is kept as 0
    year_built: toInt(pluto?.yearbuilt) || null, // PLUTO uses 0 for unknown
    updated_at: new Date().toISOString(), // the column default only applies on insert
  };
  const { data, error } = await db.from('buildings').upsert(building).select().single();
  if (error) throw new Error(`Saving building ${bbl}: ${error.message}`);
  return data;
}
