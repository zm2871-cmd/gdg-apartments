import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
const BBL = '5999999901';
const PREFIX = 'test-data03-';

const issue = (id, lat, observed_at = '2026-01-01T00:00:00') => ({
  source: '311', source_id: PREFIX + id, category: 'noise', severity: 1, status: 'open',
  description: 'test', raw: {}, observed_at, geom: `SRID=4326;POINT(-70 ${lat})`,
});

describe.skipIf(!SUPABASE_URL)('schema', () => {
  let admin, anon;

  const cleanup = async () => {
    await admin.from('issues').delete().like('source_id', `${PREFIX}%`);
    await admin.from('buildings').delete().eq('bbl', BBL); // cascades to source_fetches
  };

  beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY);
    anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    await cleanup();
    const results = await Promise.all([
      admin.from('buildings').insert({ bbl: BBL, address: 'test', borough: 'test', geom: 'SRID=4326;POINT(-70 40)' }),
      admin.from('issues').insert([
        issue('far', 40.01),             // about 1.1 km
        issue('mid', 40.0005),           // about 55 m
        issue('near', 40.0001),          // about 11 m
        issue('old', 40.0002, '2020-01-01T00:00:00'),
      ]),
    ]);
    results.forEach(({ error }) => expect(error).toBeNull());
    const { error } = await admin.from('source_fetches').insert({ bbl: BBL, source: '311', last_attempt_at: new Date().toISOString() });
    expect(error).toBeNull();
  });

  afterAll(cleanup);

  it('publishable key can read issues', async () => {
    const { data, error } = await anon.from('issues').select('source_id').like('source_id', `${PREFIX}%`);
    expect(error).toBeNull();
    expect(data).toHaveLength(4);
  });

  it('publishable key cannot write issues', async () => {
    const { error } = await anon.from('issues').insert(issue('hack', 40));
    expect(error).not.toBeNull();
    await anon.from('issues').update({ description: 'hacked' }).eq('source_id', `${PREFIX}near`);
    const { data } = await admin.from('issues').select('description').eq('source_id', `${PREFIX}near`).single();
    expect(data.description).toBe('test');
  });

  it('publishable key cannot read source_fetches', async () => {
    const { data } = await anon.from('source_fetches').select('*').eq('bbl', BBL);
    expect(data ?? []).toEqual([]);
  });

  it('issues_near returns only rows in radius and date range, nearest first', async () => {
    const { data, error } = await anon.rpc('issues_near', { lat: 40, lon: -70, radius_m: 150, since: '2025-01-01T00:00:00' });
    expect(error).toBeNull();
    expect(data.map((r) => r.source_id)).toEqual([`${PREFIX}near`, `${PREFIX}mid`]);
    expect(data[0].distance_m).toBeGreaterThan(5);
    expect(data[0].distance_m).toBeLessThan(20);
  });
});
