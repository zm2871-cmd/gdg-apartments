# Official sources

Metadata snapshots in `docs/source-metadata` were fetched directly on 2026-10-29. `npm run check:sources` checks metadata and a single row from all six datasets. `npm run check:building` exercises identity and four evidence adapters against a real address.

| Source | Dataset | Match / distinction |
|---|---|---|
| HPD registrations | tesw-yqqr | borough + block + lot, single BuildingID match |
| HPD violations | wvxf-dwi5 | BuildingID preferred, otherwise BBL tax-lot scope |
| HPD bedbug filings | wz6d-d3jb | building_id or bbl; owner-submitted historical filing |
| DOHMH rodents | p937-wjvj | BBL; positive result specifically Active Rat Signs |
| NYC 311 | erm2-nwe9 | Selected building tax-lot complaints plus relevant noise within 200m |
| PLUTO | 64uk-42ks | BBL; residential units/building count remain tax-lot metadata |

Official dataset URLs: `https://data.cityofnewyork.us/d/{dataset-id}`. Address provider: https://geosearch.planninglabs.nyc/docs/.

Adapter field names were checked against metadata; source responses are parsed as arrays of field records, then normalized defensively. Optional/invalid dated records are omitted, not invented. Reports omit apartment numbers and source contact/owner fields. Schema-drift alerting and persisted upstream version timestamps are not implemented.

Current lookback: 36 months. Page size: 200, max three pages per source, sorted recent-first (311 and HPD). Truncated counts are labeled incomplete. Latest bedbug filings are selected from the bounded result set; full supersession reconciliation requires historical ingestion.

Observed smoke on 2026-10-29: all six metadata+single-row checks succeeded; GeoSearch returned address identifiers. The real-address adapter test returned 36 rodent inspections and a capped 600 311 rows with explicit truncated coverage. These are smoke observations, not stable fixtures or claims about current building conditions.
