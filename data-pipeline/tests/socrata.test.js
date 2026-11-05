import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { querySocrata } from '../lib/socrata.js';

const TOKEN = 'test-token-do-not-leak';
const rows = (n, start = 0) => Array.from({ length: n }, (_, i) => ({ id: String(start + i) }));
const ok = (body) => new Response(JSON.stringify(body), { status: 200 });
const fail = (status, body = 'error') => new Response(body, { status });

let fetchMock;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('SOCRATA_APP_TOKEN', TOKEN);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// Runs the query while fast-forwarding through the retry waits.
async function run(query = { order: 'id', where: "bbl = '1000010001'" }) {
  const result = querySocrata('abcd-1234', query);
  result.catch(() => {}); // attach a handler now; tests still await the original promise
  await vi.runAllTimersAsync();
  return result;
}

const calledParams = (i) => new URL(fetchMock.mock.calls[i][0]).searchParams;

describe('querySocrata', () => {
  it('follows pages until a short page and sends encoded params and the token', async () => {
    fetchMock
      .mockResolvedValueOnce(ok(rows(1000)))
      .mockResolvedValueOnce(ok(rows(1000, 1000)))
      .mockResolvedValueOnce(ok(rows(3, 2000)));

    const result = await run({ select: 'id', where: "bbl = '1000010001'", order: 'id' });

    expect(result).toHaveLength(2003);
    expect(result.at(-1)).toEqual({ id: '2002' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect([0, 1, 2].map((i) => calledParams(i).get('$offset'))).toEqual(['0', '1000', '2000']);
    const first = calledParams(0);
    expect(first.get('$limit')).toBe('1000');
    expect(first.get('$order')).toBe('id');
    expect(first.get('$select')).toBe('id');
    expect(first.get('$where')).toBe("bbl = '1000010001'");
    expect(fetchMock.mock.calls[0][0]).toContain('/resource/abcd-1234.json?');
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'X-App-Token': TOKEN });
  });

  it('stops after an empty page when the total is an exact multiple of the page size', async () => {
    fetchMock.mockResolvedValueOnce(ok(rows(1000))).mockResolvedValueOnce(ok([]));
    await expect(run()).resolves.toHaveLength(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries 429 and 5xx, then succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(ok(rows(2)));

    await expect(run()).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('gives up after 3 retries', async () => {
    fetchMock.mockImplementation(async () => fail(500));
    await expect(run()).rejects.toThrow(/abcd-1234.*HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 try + 3 retries
  });

  it('does not retry a 400, and the error names the query but not the token', async () => {
    fetchMock.mockResolvedValueOnce(fail(400, 'bad $where'));

    const err = await run().catch((e) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(err.message).toMatch(/abcd-1234/);
    expect(err.message).toMatch(/bbl = '1000010001'/);
    expect(err.message).toMatch(/HTTP 400/);
    expect(err.message).not.toContain(TOKEN);
  });

  it('throws instead of returning partial rows when a later page fails', async () => {
    fetchMock.mockResolvedValueOnce(ok(rows(1000))).mockResolvedValueOnce(fail(400));
    await expect(run()).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries network errors and timeouts', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('The operation timed out.', 'TimeoutError'))
      .mockResolvedValueOnce(ok(rows(1)));
    await expect(run()).resolves.toHaveLength(1);
  });

  it('requires an order', async () => {
    await expect(querySocrata('abcd-1234', {})).rejects.toThrow(/order is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends no token header when the token is unset', async () => {
    vi.stubEnv('SOCRATA_APP_TOKEN', '');
    fetchMock.mockResolvedValueOnce(ok([]));
    await run();
    expect(fetchMock.mock.calls[0][1].headers).toEqual({});
  });
});
