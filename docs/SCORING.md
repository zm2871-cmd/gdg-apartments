# Scoring v0.1-pilot

Pure implementation: `src/lib/scoring/index.ts`.

Burden = sum(severity × reliability × recency × verified-closed adjustment), over positive eligible events and approximately grouped complaints. Severity: 1/3/6 based on explicit HPD class; otherwise 1. Reliability: violation 1, positive rodent inspection 1, bedbug filing .65, complaint .25. Recency: <=365 days 1; <=1095 .35; older .10. Verified closed HPD events .30; unknown status remains explicit. Negative inspections contribute zero burden, not an automatic A. Future/invalid dates are excluded.

311 grouping uses issue + source address (or approximate coordinate cell) + category + scope + NYC calendar day. Raw records remain separate. It is approximate, can merge unrelated reports, and does not infer unique complainants. Bedbug filings select the latest returned filing per period.

Live grade=null. Live burden is **not** a normalized score or a basis for ranking different-size buildings. No production cohort or validated denominator exists. Publish live grades only after reproducible cohorts, unit/exposure normalization, source completeness, cohort membership, versioning and confidence checks exist.

Synthetic demo reports use a frozen array of 120 illustrative burdens (0, .2, …, 23.8). Below-percentile counts map to A/B/C/D/F at 20/40/60/80 boundaries. This demonstrates grade plumbing only, not empirical validation.

Comparison uses the weighted mean of risk percentiles only for categories present in every selected report. Zero weights, fewer than two reports, or all-missing categories return no recommendation. Synthetic and live reports cannot be mixed through the API.

Unit tests cover severity, recency, closure, negative evidence, grouping, invalid dates, sparse cohorts, complaint-only evidence, missing metrics and empty comparisons. No claim of calibrated predictive performance is made.
