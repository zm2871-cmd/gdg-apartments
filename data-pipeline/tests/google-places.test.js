import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { searchText } from '../lib/google-places.js';

const KEY = 'test-key-do-not-leak';
const MASK = 'places.id,places.formattedAddress';
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status, body = 'error') => new Response(body, { status });

let fetchMock;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', KEY);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Runs the search while fast-forwarding through the retry waits.
async function run(mask = MASK) {
  const result = searchText('161 Newel St, Brooklyn, NY', { lat: 40.72, lon: -73.94, radius: 50 }, mask);
  result.catch(() => {}); // attach a handler now; tests still await the original promise
  await vi.runAllTimersAsync();
  return result;
}

describe('searchText', () => {
  it('returns places and sends the key, mask and location bias', async () => {
    fetchMock.mockResolvedValueOnce(ok({ places: [{ id: 'abc' }] }));
    await expect(run()).resolves.toEqual([{ id: 'abc' }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(init.headers['X-Goog-Api-Key']).toBe(KEY);
    expect(init.headers['X-Goog-FieldMask']).toBe(MASK);
    expect(JSON.parse(init.body)).toEqual({
      textQuery: '161 Newel St, Brooklyn, NY',
      pageSize: 5,
      locationBias: { circle: { center: { latitude: 40.72, longitude: -73.94 }, radius: 50 } },
    });
  });

  it('returns [] when Google finds nothing', async () => {
    fetchMock.mockResolvedValueOnce(ok({}));
    await expect(run()).resolves.toEqual([]);
  });

  it('retries 429 and 5xx, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok({ places: [{ id: 'abc' }] }));
    await expect(run()).resolves.toEqual([{ id: 'abc' }]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retries run out', async () => {
    fetchMock.mockResolvedValue(fail(500));
    await expect(run()).rejects.toThrow('HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('fails fast on 403 without leaking the key', async () => {
    fetchMock.mockResolvedValueOnce(fail(403, 'PERMISSION_DENIED'));
    const err = await run().catch((e) => e);
    expect(err.message).toContain('HTTP 403 PERMISSION_DENIED');
    expect(err.message).not.toContain(KEY);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast on 400', async () => {
    fetchMock.mockResolvedValueOnce(fail(400));
    await expect(run()).rejects.toThrow('HTTP 400');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // null, not undefined: undefined would pick up run()'s default mask
  it.each([null, '', '*', 'places.*'])('rejects mask %j without calling Google', async (mask) => {
    await expect(run(mask)).rejects.toThrow('field mask is required');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a missing key without calling Google', async () => {
    vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
    await expect(run()).rejects.toThrow('GOOGLE_MAPS_API_KEY is not set');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
