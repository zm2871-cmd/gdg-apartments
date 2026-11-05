import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeBbl } from '../lib/bbl.js';
import { searchAddress } from '../lib/geosearch.js';

const newelSt = JSON.parse(readFileSync(new URL('./fixtures/geosearch/newel-st.json', import.meta.url)));
const respond = (body, status = 200) => new Response(JSON.stringify(body), { status });
const feature = (pad, label = 'X') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [-73.9, 40.7] }, properties: { label, addendum: pad ? { pad } : undefined } });

let fetchMock;
beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('normalizeBbl', () => {
  it.each([
    ['4087860042.00000000', '4087860042'],
    ['3026230011', '3026230011'],
    [3026230011, '3026230011'],
    [' 1000087501 ', '1000087501'],
    ['0', null],
    ['0000000000', null],
    ['6000000001', null],
    ['302623001', null],
    ['abc', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%j -> %j', (input, expected) => expect(normalizeBbl(input)).toBe(expected));
});

describe('searchAddress', () => {
  it('resolves 161 Newel St to BBL 3026230011, BIN 3065755', async () => {
    fetchMock.mockResolvedValueOnce(respond(newelSt));

    const [match] = await searchAddress('161 Newel St');

    expect(match).toEqual({
      label: '161 NEWEL STREET, Brooklyn, NY, USA', bbl: '3026230011', bin: '3065755',
      borough: 'Brooklyn', lat: 40.727734, lon: -73.949269,
    });
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/v2/autocomplete');
    expect(url.searchParams.get('text')).toBe('161 Newel St');
    expect(url.searchParams.get('size')).toBe('5');
  });

  it('drops matches without a valid BBL', async () => {
    fetchMock.mockResolvedValueOnce(respond({ features: [feature(null, 'a street'), feature({ bbl: '0' }), feature({ bbl: '3026230011' }, 'ok')] }));
    const matches = await searchAddress('x');
    expect(matches.map((m) => m.label)).toEqual(['ok']);
    expect(matches[0].bin).toBeNull();
  });

  it('keeps one match per building when GeoSearch returns alternate spellings', async () => {
    fetchMock.mockResolvedValueOnce(respond({ features: [
      feature({ bbl: '3014780001', bin: '3039609' }, "1306 B'WAY"),
      feature({ bbl: '3014780001', bin: '3039609' }, '1306 BWAY EAST'),
      feature({ bbl: '3014780005', bin: '3330848' }, '1314 BROADWAY'),
      feature({ bbl: '3014780005', bin: '3330849' }, '1318 BWAY EAST'), // same lot, different building: kept
    ] }));
    const matches = await searchAddress('Broadway');
    expect(matches.map((m) => m.label)).toEqual(["1306 B'WAY", '1314 BROADWAY', '1318 BWAY EAST']);
  });

  it('returns [] when nothing matches', async () => {
    fetchMock.mockResolvedValueOnce(respond({ features: [] }));
    await expect(searchAddress('nowhere')).resolves.toEqual([]);
  });

  it('returns [] for blank input without calling GeoSearch', async () => {
    await expect(searchAddress('   ')).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws on an HTTP error, naming the query', async () => {
    fetchMock.mockResolvedValueOnce(respond({}, 500));
    await expect(searchAddress('161 Newel St')).rejects.toThrow(/161 Newel St.*HTTP 500/);
  });

  it('throws on a response with an unexpected shape', async () => {
    fetchMock.mockResolvedValueOnce(respond({ unexpected: true }));
    await expect(searchAddress('x')).rejects.toThrow();
  });
});
