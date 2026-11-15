import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { geosearchSchema, rowSchemas } from '../lib/schemas.js';

const dir = new URL('./fixtures/', import.meta.url);
const files = (source) => readdirSync(new URL(`${source}/`, dir)).map((f) => [f, JSON.parse(readFileSync(new URL(`${source}/${f}`, dir)))]);

describe.each(Object.entries(rowSchemas))('%s schema', (source, schema) => {
  it.each(files(source))('accepts every row in %s', (_, fixture) => {
    for (const row of fixture.rows) {
      const result = schema.safeParse(row);
      expect(result.error?.issues, JSON.stringify(row).slice(0, 300)).toBeUndefined();
    }
  });
});

describe('geosearch schema', () => {
  it.each(files('geosearch'))('accepts %s', (_, fixture) => {
    expect(geosearchSchema.safeParse(fixture).error?.issues).toBeUndefined();
  });
});

describe('schemas', () => {
  it('reject a row missing a required field', () => {
    expect(rowSchemas.hpd_violations.safeParse({ violationid: '1' }).success).toBe(false);
  });

  it('ignore unknown upstream columns', () => {
    const row = { unique_key: '1', created_date: '2026-01-01T00:00:00.000', complaint_type: 'Noise', status: 'Closed', new_column: 'x' };
    expect(rowSchemas.three_one_one_requests.safeParse(row).success).toBe(true);
  });
});
