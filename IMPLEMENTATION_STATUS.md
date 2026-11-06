> **Current override: AI is hard-disabled at the owner’s request.** OpenAI call code and SDK have been removed. API keys, environment flags and request consent cannot enable AI. The advisor is deterministic only; older descriptions of optional AI below describe the previous implementation, not current behavior. Re-enabling requires an explicitly authorized code change. Hosting/database/map charges are separate from AI and are not controlled by this lock.

# Implementation status — 2026-10-29

## Implemented and exercised

- **Live:** GeoSearch autocomplete/resolution, official HPD registration reconciliation, PLUTO tax-lot enrichment, HPD violations/bedbug, DOHMH rodent, and NYC 311 adapters. Six dataset metadata and row smoke checks passed. A real-address adapter lookup returned real records with a visible truncation state.
- **Application:** responsive editorial homepage, report pages, source ledger/filter/pagination, 3/12/36-month event chart, checklist printing, share links, comparison removal/reordering/weights, deterministic advisor, informational/legal pages, loading/error/not-found and SEO metadata.
- **Demo:** three fictional buildings, synthetic calibrated grades, synthetic lease examples. Labels are explicit; real requests never silently switch modes.
- **Safety:** allowlisted upstream URLs, numeric identifiers, Zod inputs, safe rendering, conservative missing-data behavior, source scopes, per-process rate limits, security headers and owner checks.
- **Tests:** 51 unit tests and 9 Chromium end-to-end tests passed before final hardening. Screenshot inspection at 1440 and 375px; browser layout tests also cover 768px. Final rerun results are recorded below.

## Implemented, requires credentials / external verification

- Supabase SQL migrations with PostGIS, normalized columns, RLS, private bucket, atomic AI quota and saved research. Email-link authentication, session refresh, account preferences/deletion.
- Private PDF upload, genuine PDF.js extraction, anchored deterministic findings, retry, delete and scheduled 30-day cleanup. Real synthetic PDF parsing is unit-tested; hosted ownership/storage lifecycle has not been exercised.
- OpenAI Responses structured advisor with citation validation, explicit consent, quota reservation and deterministic fallback. No paid model call was made.
- Dynamic MapLibre map with provider attribution and record markers. Map-free fallback is tested; no licensed provider style was supplied.
- Vercel config and CI supplied. No Vercel project or deployment was created.

## Critical launch blockers and exact remaining work

1. Provision an isolated Supabase project, apply both migrations, run `npm run test:rls`, test two-user storage access/deletion, email redirects, account deletion and cron cleanup. No Postgres/Docker/Supabase CLI runtime or project credentials were available. SQL correctness and actual RLS enforcement are not claimed as executed. Generate DB types and wire them into clients.
2. Validate citywide scoring cohorts, normalized denominators, confidence and empirical calibration. Live grades intentionally remain **Not yet graded**. Synthetic grade plumbing is not a production baseline.
3. Expand ingestion beyond one building/day: durable per-source cursor continuation/backfill, historical corrections/supersession, many-to-many building-to-record scopes, persisted analysis groups, upstream version/health history, locks and operational alerts. Current targeted rolling query/checkpoint logging is functional but not the complete master pipeline.
4. Improve alias/corner-address/ZIP reconciliation. Current exact BBL-to-single-HPD matching preserves ambiguity but does not resolve all aliases or multi-building lots. Without Supabase, live reports are process-local and cannot be relied on across restarts/serverless instances.
5. Harden PDF hosting: private direct-to-storage upload for Vercel’s smaller request-body limit, isolated parser worker, distributed upload quotas, mixed scanned-page detection, storage orphan reconciliation and authenticated lifecycle browser tests. Only deterministic topic screening exists; optional lease-AI classification, OCR and legal conflict classification are not implemented.
6. Qualified counsel review of rules and policy drafts. Findings identify topics, not legal violations; benign topic mentions intentionally trigger review. No unit rent-stabilization determination is made.
7. Configure/test a real map style and OpenAI model. Add advisor snapshot cache, global concurrency/spend controls and semantic claim evaluation. Source-ID validation alone cannot prove the truth of every AI sentence.
8. Add distributed public request limits / firewall policy, restrictive nonce-based CSP, monitoring (Sentry env is currently unused), accessibility audit and measured Lighthouse/Core Web Vitals. Current CSP retains inline/eval compatibility; no score is claimed.
9. Requested shadcn/Radix/Motion component integration is not used in the current plain semantic UI. Full snapshot-delta trends, source freshness history, per-unit normalization and broad P1 integration coverage remain incomplete.

## Run and deploy

Local: `npm install`, `cp .env.example .env.local`, `npm run dev`.
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run build`.
Sources: `npm run check:sources`, `npm run check:building`.
Supabase: link project with CLI, `npm run db:migrate`; see README for auth redirects and RLS checks.
Vercel: import repo, Node 22, `npm ci`, `npm run build`, configure env and cron secret. See README for map/AI/PDF caveats.

The successful production build uses supported `next build --webpack`; Turbopack failed due to a local worker-port restriction. Initial PDF.js type errors and an empty-comparison render bug were fixed and retested.

## Final executed quality gates

- `npm run typecheck`: PASS.
- `npm run lint`: PASS, zero errors and zero warnings.
- `npm test`: PASS, 51 tests across four files, including genuine synthetic PDF extraction and image-only rejection.
- `npm run test:e2e`: PASS, 9 tests; repeated against the built production server with all 9 passing.
- `npm run build`: PASS, Webpack production compilation, TypeScript and 26 static-page generation steps completed.
- `npm run check:sources`: PASS, six official metadata/single-row checks plus GeoSearch.
- `npm run check:building` (equivalent script invocation): PASS, real identity and all four record adapters, including explicit truncation.
- `npm run test:rls`: BLOCKED / exit 1 as designed: isolated Supabase project/service key required. No RLS enforcement claim is made.
- No deployment, paid AI call, licensed map-style check, or hosted private-file lifecycle verification was performed.
