export const dataset_ids = {
    hpd_violations: "wvxf-dwi5",
    hpd_complaints: "ygpa-z7cr",
    rodent_inspections: "p937-wjvj",
    bedbug_filings: "wz6d-d3jb",
    three_one_one_requests: "erm2-nwe9",
    pluto: "64uk-42ks",
};

export const time_windows = {
    hpd_violations: { months: 36 },      
    hpd_complaints: { months: 12 },
    rodent_inspections: { months: 24 },
    bedbug_filings: { filing_years: 2 }, 
    three_one_one_requests: { months: 12 },
};

export const three_one_one_search_radius = { meters: 150 };

// Start of a time window as NYC wall-clock midnight with no zone suffix, matching how Socrata stores dates.
// The day is clamped so "1 month before March 31" is February 28/29, not March 3.
export function cutoff(months, now = new Date()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 - months, Math.min(d, lastDay))).toISOString().slice(0, 10) + 'T00:00:00';
}
