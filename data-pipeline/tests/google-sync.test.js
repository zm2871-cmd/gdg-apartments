import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchText } from '../lib/google-places.js';
import { syncGooglePlace } from '../lib/google-match.js';

vi.mock('../lib/google-places.js', () => ({ searchText: vi.fn() }));

const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
const BBL = '5999999908'; // reserved fake BBL; other test files use …01 to …07
const building = { bbl: BBL, address: '160 TEST STREET, Staten Island, NY, USA', lat: 40.6, lon: -74.1 };
const listing = { id: 'test-place', formattedAddress: '160 Test St, Staten Island, NY', location: { latitude: 40.6, longitude: -74.1 } };

describe.skipIf(!SUPABASE_URL)('syncGooglePlace against the database', () => {
  const db = createClient(SUPABASE_URL ?? 'http://x', SUPABASE_SECRET_KEY ?? 'x');
  const row = async (table) => {
    let q = db.from(table).select('*').eq('bbl', BBL);
    if (table === 'source_fetches') q = q.eq('source', 'google');
    return (await q.maybeSingle()).data;
  };
  const age = (days) => ({ matched_at: new Date(Date.now() - days * 864e5).toISOString() });

  beforeEach(async () => {
    vi.mocked(searchText).mockReset();
    await db.from('buildings').delete().eq('bbl', BBL); // cascades to google_places and source_fetches
    const { error } = await db.from('buildings').insert({ bbl: BBL, address: building.address, borough: 'test', geom: 'SRID=4326;POINT(-74.1 40.6)' });
    expect(error).toBeNull();
  });
  afterAll(() => db.from('buildings').delete().eq('bbl', BBL));

  it('saves a match, then skips Google on the next run', async () => {
    vi.mocked(searchText).mockResolvedValueOnce([listing]);
    await expect(syncGooglePlace(building, db)).resolves.toEqual({ source: 'google', status: 'ok', placeId: 'test-place' });
    expect(await row('google_places')).toMatchObject({ place_id: 'test-place' });
    expect(await row('source_fetches')).toMatchObject({ row_count: 1, last_error: null });

    await expect(syncGooglePlace(building, db)).resolves.toMatchObject({ status: 'skipped', placeId: 'test-place' });
    expect(searchText).toHaveBeenCalledTimes(1);
  });

  it('saves "no listing", skips it for 90 days, then searches again', async () => {
    vi.mocked(searchText).mockResolvedValue([]);
    await expect(syncGooglePlace(building, db)).resolves.toMatchObject({ status: 'ok', placeId: null });
    expect(await row('google_places')).toMatchObject({ place_id: null });

    await db.from('google_places').update(age(89)).eq('bbl', BBL);
    await expect(syncGooglePlace(building, db)).resolves.toMatchObject({ status: 'skipped' });
    await db.from('google_places').update(age(91)).eq('bbl', BBL);
    await expect(syncGooglePlace(building, db)).resolves.toMatchObject({ status: 'ok' });
    expect(searchText).toHaveBeenCalledTimes(2);
  });

  it('records a Google failure without throwing or saving a row', async () => {
    vi.mocked(searchText).mockRejectedValueOnce(new Error('Google Places searchText: HTTP 403'));
    await expect(syncGooglePlace(building, db)).resolves.toMatchObject({ status: 'failed', error: expect.stringContaining('403') });
    expect(await row('google_places')).toBeNull();
    expect(await row('source_fetches')).toMatchObject({ last_success_at: null, last_error: expect.stringContaining('403') });
  });
});
