// Live check of matchPlace() against real NYC buildings. Prints results and saves nothing (ToS §3.2.3).
// Costs one Pro-tier Text Search per address. Run: node --env-file=.env scripts/check-google-match.js
import { matchPlace } from '../lib/google-match.js';
import { searchAddress } from '../lib/geosearch.js';

// expected: true = has a Google apartment listing, false = should match nothing (checked 2026-11-10).
const CASES = [
  ['1 Blue Slip, Brooklyn', true],
  ['435 W 31st St, Manhattan', true],
  ['1 N 4th Pl, Brooklyn', true],
  ['160 W 66th St, Manhattan', false], // 165 W 66th St is listed 64 m away
  ['1580 Metropolitan Ave, Bronx', false], // 1594 Metropolitan Ave is listed 54 m away
  ['161 Newel St, Brooklyn', false],
  ['2818 Bronx Park East, Bronx', false],
  ['50-01 2nd St, Queens', false],
  ['9 Carroll Place, Staten Island', false],
];

let failures = 0;
for (const [query, expected] of CASES) {
  const [m] = await searchAddress(query);
  const id = m ? await matchPlace({ address: m.label, lat: m.lat, lon: m.lon }) : null;
  const pass = Boolean(id) === expected;
  if (!pass) failures++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${query} -> ${id ? 'matched' : 'null'} (expected ${expected ? 'match' : 'null'})`);
}
process.exit(failures ? 1 : 0);
