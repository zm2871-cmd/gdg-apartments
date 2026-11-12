// Saves real responses from every source to tests/fixtures/<source>/<label>.json.
// Run: node --env-file=.env scripts/capture-fixtures.js
import { mkdir, writeFile } from 'node:fs/promises';
import { geosearch } from '../lib/geosearch.js';
import { querySocrata } from '../lib/socrata.js';
import { cutoff, dataset_ids, time_windows, three_one_one_search_radius } from '../lib/sources.js';

const MAX_SAVED_ROWS = 200; // keeps big buildings' fixtures small; total_rows records the real count
const OUT_DIR = new URL('../tests/fixtures/', import.meta.url);

const BUILDINGS = [
  { label: 'many-violations', address: '2818 Bronx Park East, Bronx', bbl: '2045060040' },
  { label: 'clean', address: '109 Bruckner Blvd, Bronx', bbl: '2022780059' },
  { label: 'large', address: '50-01 2nd St, Queens', bbl: '4000160008' },
  { label: 'small', address: '9 Carroll Place, Staten Island', bbl: '5000030028' },
  { label: 'nightlife', address: '190 Orchard St, Manhattan', bbl: '1004120010' },
  { label: 'condo', address: '39 Whitehall St, Manhattan', bbl: '1000087501' },
  { label: 'multi-building', address: '281 Marcus Garvey Blvd, Brooklyn', bbl: '3016290001' },
  { label: 'condo-multi-building', address: '1580 Metropolitan Ave, Bronx', bbl: '2039437501' },
];

function queriesFor({ bbl }, [lon, lat]) {
  const boro = bbl[0], block = String(Number(bbl.slice(1, 6))), lot = String(Number(bbl.slice(6)));
  return {
    pluto: { where: `bbl = ${bbl}`, order: 'bbl' },
    hpd_violations: {
      where: `bbl = '${bbl}' AND (inspectiondate >= '${cutoff(time_windows.hpd_violations.months)}' OR violationstatus = 'Open')`,
      order: 'inspectiondate DESC, violationid',
    },
    hpd_complaints: {
      where: `bbl = ${bbl} AND received_date >= '${cutoff(time_windows.hpd_complaints.months)}'`,
      order: 'received_date DESC, problem_id',
    },
    // Many rodent rows have no bbl, so also match on borough, block and lot (plan §2, DATA-10).
    rodent_inspections: {
      where: `(bbl = ${bbl} OR (boro_code = ${boro} AND block = '${block}' AND lot = '${lot}')) AND inspection_date >= '${cutoff(time_windows.rodent_inspections.months)}'`,
      order: 'inspection_date DESC, :id',
    },
    // All filings: they're yearly, so few rows; the fetcher picks the latest filing_years later.
    bedbug_filings: { where: `bbl = '${bbl}'`, order: 'filing_date DESC, :id' },
    three_one_one_requests: {
      where: `within_circle(location, ${lat}, ${lon}, ${three_one_one_search_radius.meters}) AND created_date >= '${cutoff(time_windows.three_one_one_requests.months)}'`,
      order: 'created_date DESC, unique_key',
    },
  };
}

async function save(source, label, data) {
  const dir = new URL(`${source}/`, OUT_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(`${label}.json`, dir), JSON.stringify(data, null, 2) + '\n');
}

const captured_at = new Date().toISOString();
const failures = [];

for (const building of BUILDINGS) {
  const geo = await geosearch(building.address, 1);
  await save('geosearch', building.label, geo);
  const feature = geo.features?.[0];
  if (!feature) { failures.push(`${building.label}: GeoSearch found nothing`); continue; }
  const geoBbl = feature.properties.addendum?.pad?.bbl;
  if (geoBbl !== building.bbl) console.warn(`! ${building.label}: GeoSearch BBL ${geoBbl} != expected ${building.bbl}`);

  for (const [source, query] of Object.entries(queriesFor(building, feature.geometry.coordinates))) {
    const started = Date.now();
    try {
      const rows = await querySocrata(dataset_ids[source], query);
      await save(source, building.label, {
        source, label: building.label, address: building.address, bbl: building.bbl, query, captured_at,
        total_rows: rows.length, rows: rows.slice(0, MAX_SAVED_ROWS),
      });
      console.log(`${building.label.padEnd(22)} ${source.padEnd(24)} ${String(rows.length).padStart(5)} rows  ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      failures.push(`${building.label} ${source}: ${err.message}`);
    }
  }
}

if (failures.length) {
  console.error('\nFailures:\n' + failures.join('\n'));
  process.exitCode = 1;
}
