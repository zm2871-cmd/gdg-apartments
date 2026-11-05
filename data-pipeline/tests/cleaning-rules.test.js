import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isExcluded311, shouldDropIssue } from '../lib/cleaning-rules.js';

const dir = new URL('./fixtures/three_one_one_requests/', import.meta.url);
const rows311 = readdirSync(dir).flatMap((f) => JSON.parse(readFileSync(new URL(f, dir))).rows);
const fixtureRow = (pattern) => {
  const row = rows311.find((r) => pattern.test(r.resolution_description ?? ''));
  if (!row) throw new Error(`no fixture row matches ${pattern}`);
  return row;
};
const noise = (fields) => ({ complaint_type: 'Noise - Residential', resolution_description: 'The Police Department responded and took action.', ...fields });

describe('isExcluded311', () => {
  it('drops helicopter noise', () => {
    expect(isExcluded311(noise({ complaint_type: 'Noise - Helicopter' }))).toBe(true);
  });

  it.each(['Noise - Vehicle', 'Noise - Park', 'Noise - Residential', 'Noise - Commercial'])('keeps %s', (type) => {
    expect(isExcluded311(noise({ complaint_type: type }))).toBe(false);
  });

  it('drops a real DEP duplicate closure', () => {
    expect(isExcluded311(fixtureRow(/duplicate of a previously filed/i))).toBe(true);
  });

  it('drops a real NYPD "not within jurisdiction" closure', () => {
    expect(isExcluded311(fixtureRow(/does not fall under the jurisdiction/i))).toBe(true);
  });

  it('drops a real DEP closure referred to NYPD', () => {
    expect(isExcluded311(fixtureRow(/referred it to the New York Police/i))).toBe(true);
  });

  it.each([
    "This complaint does not fall under the Police Department's jurisdiction.",
  ])('drops the citywide wording: %s', (resolution_description) => {
    expect(isExcluded311(noise({ resolution_description }))).toBe(true);
  });

  it('keeps an ordinary closure and a row with no resolution yet', () => {
    expect(isExcluded311(fixtureRow(/observed no evidence of a criminal violation/i))).toBe(false);
    expect(isExcluded311(noise({ resolution_description: undefined }))).toBe(false);
  });
});

describe('shouldDropIssue', () => {
  const base = { observedAt: '2026-10-31T02:53:39.000', lat: 40.7, lon: -73.9 };

  it('drops an issue with no date and no location', () => {
    expect(shouldDropIssue({ ...base, observedAt: null, lat: undefined, lon: undefined })).toBe(true);
  });

  it('keeps an issue missing only its date', () => {
    expect(shouldDropIssue({ ...base, observedAt: null })).toBe(false);
  });

  it('keeps an issue missing only its location', () => {
    expect(shouldDropIssue({ ...base, lat: undefined, lon: undefined })).toBe(false);
  });

  it('treats a half-missing location as no location', () => {
    expect(shouldDropIssue({ ...base, observedAt: null, lon: undefined })).toBe(true);
  });

  it('keeps an issue with both', () => {
    expect(shouldDropIssue(base)).toBe(false);
  });
});
