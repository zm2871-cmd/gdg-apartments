// Returns a 10-digit BBL string, or null if the value isn't a valid BBL.
// Accepts PLUTO's "4087860042.00000000", plain strings and numbers.
export function normalizeBbl(value) {
  const bbl = String(value ?? '').trim().replace(/\.0+$/, '');
  return /^[1-5]\d{9}$/.test(bbl) ? bbl : null;
}
