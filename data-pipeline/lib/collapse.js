const previousDay = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** "night:2026-10-31" (6 pm–6 am, counted under the start date) or "day:2026-10-31" (6 am–6 pm). */
export function periodOf (observedAt) {
    // Read the NYC wall-clock string directly: new Date() would shift it by the machine's time zone.
    const date = observedAt.slice(0, 10)
    const hour = Number(observedAt.slice(11, 13));

    if (hour >= 18) return `night:${date}`;
    else if (hour < 6) return `night:${previousDay(date)}`;
    else return `day:${date}`;
}

/** Merges 311 complaints with the same complaint_type, BBL and night/day into one row with sourceIds and count. */
export function collapse (issues) {
    const groups = new Map();
    for (const issue of [...issues].sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''))) {
        // No BBL or no date: not known to be the same place or time, so never merged.
        const key = issue.bbl && issue.observedAt
            ? `${issue.raw.complaint_type}|${issue.bbl}|${periodOf(issue.observedAt)}`
            :  `single|${issue.sourceId}`;
        const group = groups.get(key);
        if (!group) {
            groups.set(key, { ...issue, sourceIds: [issue.sourceId], count: 1 });
        } else {
            group.sourceIds.push(issue.sourceId);
            group.count += 1;
            if (issue.status === 'open') group.status = 'open';
        }
    }
    return [...groups.values()];
}