// Drop rules held as data so they can be tuned without touching fetcher code.

// 311 complaint types that aren't about the building's surroundings (spec §5.2).
// Noise - Vehicle and Noise - Park are deliberately kept.
export const excluded311ComplaintTypes = ['Noise - Helicopter'];

// 311 closures that mean the complaint shouldn't count. Matched against resolution_description.
// Covers every wording seen citywide for noise in the 12 months to November 2026:
// DEP "duplicate of a previously filed complaint", NYPD "does not fall under the jurisdiction",
// "does not fall under the Police Department's jurisdiction", and DEP "not under its jurisdiction
// and referred it to the New York Police Department" (NYPD opens its own request, so dropping avoids double counting).
export const excluded311Resolutions = [/duplicate of a previously filed/i, /jurisdiction/i];

/** True if a raw 311 row should be dropped before mapping. */
export function isExcluded311(row) {
  return excluded311ComplaintTypes.includes(row.complaint_type)
    || excluded311Resolutions.some((pattern) => pattern.test(row.resolution_description ?? ''));
}

/** True if an Issue has neither a date nor a location, so it can't be placed in time or on the map. */
export function shouldDropIssue(issue) {
  return !issue.observedAt && (issue.lat == null || issue.lon == null);
}
