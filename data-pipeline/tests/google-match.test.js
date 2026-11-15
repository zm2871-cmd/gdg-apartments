import { afterEach, describe, expect, it, vi } from 'vitest';
import { houseNumber, matchPlace, pickPlace } from '../lib/google-match.js';

// Hand-written candidates modeled on live results from 2026-11-10. Real Google responses aren't saved as
// fixtures, because ToS §3.2.3(a) bans storing places information.
const building = { address: '160 WEST 66 STREET, New York, NY, USA', lat: 40.7745, lon: -73.9857 };
const place = (id, formattedAddress, dLatM, types = ['apartment_building']) => ({
  id, formattedAddress, types, location: { latitude: building.lat + dLatM / 111_320, longitude: building.lon },
});

describe('houseNumber', () => {
  it.each([
    ['161 NEWEL STREET, Brooklyn, NY, USA', '161'],
    ['50-01 2 STREET, Long Island City, NY, USA', '50-01'],
    ['50-01 2nd St, Long Island City, NY 11101, USA', '50-01'],
    ['1594 Metropolitan Ave Apt MA, Bronx, NY 10462, USA', '1594'],
    ['Empire State Building, 350 5th Ave, New York, NY 10118, USA', '350'],
    ['12A Main St, Brooklyn', '12A'],
    ['Broadway, New York', null],
    [undefined, null],
  ])('%j -> %j', (address, expected) => expect(houseNumber(address)).toBe(expected));
});

describe('pickPlace', () => {
  it('accepts a same-number listing within 50 m', () => {
    expect(pickPlace([place('ok', '160 W 66th St, New York, NY 10023, USA', 20)], building)).toBe('ok');
  });

  it('rejects a nearby building with a different number (165 vs 160 W 66th, seen live)', () => {
    expect(pickPlace([place('neighbor', '165 W 66th St, New York, NY 10023, USA', 30)], building)).toBeNull();
  });

  it('rejects a same-number listing over 50 m away', () => {
    expect(pickPlace([place('far', '160 W 66th St, New York, NY 10023, USA', 60)], building)).toBeNull();
  });

  it('picks the nearest of several valid candidates', () => {
    const places = [place('b', '160 W 66th St, New York', 40), place('a', '160 W 66th St, New York', 5)];
    expect(pickPlace(places, building)).toBe('a');
  });

  it('skips candidates without a location', () => {
    expect(pickPlace([{ id: 'x', formattedAddress: '160 W 66th St, New York' }], building)).toBeNull();
  });

  it('returns null for no candidates or a building address without a number', () => {
    expect(pickPlace([], building)).toBeNull();
    expect(pickPlace([place('ok', '160 W 66th St', 0)], { ...building, address: 'Broadway, New York' })).toBeNull();
  });
});

describe('matchPlace', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('searches apartment buildings with the cheap mask and returns the picked ID', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', 'k');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ places: [place('ok', '160 W 66th St, New York', 10)] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(matchPlace(building)).resolves.toBe('ok');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['X-Goog-FieldMask']).toBe('places.id,places.formattedAddress,places.location,places.types');
    expect(JSON.parse(init.body)).toMatchObject({ textQuery: building.address, includedType: 'apartment_building', locationBias: { circle: { radius: 50 } } });
  });
});
