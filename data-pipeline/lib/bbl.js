// Returns a 10-digit BBL string, or null if the value isn't a valid BBL.
// Accepts PLUTO's "4087860042.00000000", plain strings and numbers.
export function normalizeBbl(value) {
  const bbl = String(value ?? '').trim().replace(/\.0+$/, '');
  return /^[1-5]\d{9}$/.test(bbl) ? bbl : null;
}

// BBL from separate borough, block and lot fields (HPD's buildings list), or null if they don't make a valid one.
export function bblFromParts(boro, block, lot) {
  if (!/^\d+$/.test(String(block ?? '')) || !/^\d+$/.test(String(lot ?? ''))) return null;
  if (Number(block) === 0 || String(block).length > 5 || String(lot).length > 4) return null;
  return normalizeBbl(`${boro}${String(block).padStart(5, '0')}${String(lot).padStart(4, '0')}`);
}
