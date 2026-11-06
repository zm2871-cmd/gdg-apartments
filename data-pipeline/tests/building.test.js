import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveBuilding } from '../lib/building.js';
import { querySocrata } from '../lib/socrata.js';

vi.mock('../lib/socrata.js', () => ({ querySocrata: vi.fn() }));

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const BBL = '5999999902'; // reserved fake BBL; tests/schema.test.js uses 5999999901
const match = { label: 'TEST BUILDING, Staten Island, NY, USA', bbl: BBL, bin: '5999999', borough: 'Staten Island', lat: 40.6, lon: -74.1 };

describe('resolveBuilding', () => {
  it('rejects an invalid BBL without querying PLUTO or the database', async () => {
    const db = { from: vi.fn() };
    await expect(resolveBuilding({ ...match, bbl: '0' }, db)).rejects.toThrow(/invalid BBL/);
    expect(querySocrata).not.toHaveBeenCalled();
    expect(db.from).not.toHaveBeenCalled();
  });
});

describe.skipIf(!SUPABASE_URL)('resolveBuilding against the database', () => {
  let db;
  const cleanup = () => db.from('buildings').delete().eq('bbl', BBL);

  beforeAll(async () => {
    db = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    await cleanup();
  });
  afterAll(cleanup);
  beforeEach(() => vi.mocked(querySocrata).mockReset());

  it('stores PLUTO units and year built, with the address and point from GeoSearch', async () => {
    vi.mocked(querySocrata).mockResolvedValueOnce([{ bbl: `${BBL}.00000000`, unitsres: '24', yearbuilt: '1931' }]);

    const saved = await resolveBuilding(match, db);

    expect(querySocrata).toHaveBeenCalledWith('64uk-42ks', expect.objectContaining({ where: `bbl = ${BBL}` }));
    expect(saved).toMatchObject({ bbl: BBL, bin: '5999999', address: match.label, borough: 'Staten Island', units_res: 24, year_built: 1931 });
    expect(saved.geom).toBeTruthy(); // geom is not null, so a saved row means the EWKT point was accepted
  });

  it('saves the building with null units and year when PLUTO has no row', async () => {
    vi.mocked(querySocrata).mockResolvedValueOnce([]);
    const saved = await resolveBuilding(match, db);
    expect(saved).toMatchObject({ bbl: BBL, units_res: null, year_built: null });
  });

  it('keeps unitsres 0 and treats yearbuilt 0 as unknown', async () => {
    vi.mocked(querySocrata).mockResolvedValueOnce([{ bbl: BBL, unitsres: '0', yearbuilt: '0' }]);
    const saved = await resolveBuilding(match, db);
    expect(saved).toMatchObject({ units_res: 0, year_built: null });
  });

  it('updates the same row in place on a repeat upsert', async () => {
    vi.mocked(querySocrata)
      .mockResolvedValueOnce([{ bbl: BBL, unitsres: '10', yearbuilt: '1950' }])
      .mockResolvedValueOnce([{ bbl: BBL, unitsres: '12', yearbuilt: '1950' }]);

    const first = await resolveBuilding(match, db);
    await new Promise((r) => setTimeout(r, 20));
    const second = await resolveBuilding(match, db);

    const { data: rows } = await db.from('buildings').select('bbl, units_res').eq('bbl', BBL);
    expect(rows).toEqual([{ bbl: BBL, units_res: 12 }]);
    expect(new Date(second.updated_at) > new Date(first.updated_at)).toBe(true);
  });
});
