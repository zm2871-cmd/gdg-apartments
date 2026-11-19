import { describe, expect, it } from 'vitest';
import { bblFromParts } from '../lib/bbl.js';

describe('bblFromParts', () => {
  it.each([
    [['3', '5272', '29'], '3052720029'],
    [['1', '16', '7501'], '1000167501'],
    [['3', '0', '0'], null],        // HPD's placeholder rows
    [['6', '1', '1'], null],
    [['1', '123456', '1'], null],
    [['1', '12', '12345'], null],
    [['1', undefined, '1'], null],
  ])('%j -> %j', (parts, expected) => expect(bblFromParts(...parts)).toBe(expected));
});
