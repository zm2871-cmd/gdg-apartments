> **Current override: AI is hard-disabled at the owner’s request.** OpenAI call code and SDK have been removed. API keys, environment flags and request consent cannot enable AI. The advisor is deterministic only; older descriptions of optional AI below describe the previous implementation, not current behavior. Re-enabling requires an explicitly authorized code change. Hosting/database/map charges are separate from AI and are not controlled by this lock.

# Architecture

Next.js server components render public pages; small client components handle search, chart controls, comparison weights, accounts and private document actions. Route handlers validate with Zod and return JSON errors. Official adapters fetch from an explicit HTTPS host allowlist, timeout after 9 seconds per attempt, retry transient errors, and bound queries to 600 records per source. Calls are sequential per report to avoid flooding the provider. Concurrent users still require deployment-level traffic controls.

Identity is a SHA-256-derived 96-bit address ID. GeoSearch coordinates/BBL are validated to NYC bounds; matching a single HPD registration on the exact tax lot upgrades confidence. Multiple registrations retain ambiguity. PLUTO enrichment stays tax-lot-scoped. An address label hash is stable but does not canonicalize every alias to one building. ZIP/alias reconciliation and multi-building tax-lot disambiguation need further work.

Supabase stores identities and report snapshots. Public official tables are read-only to clients. Private objects use owner RLS and server authorization. Server service-role writes official data and performs storage-first document deletion. Cookie refresh uses Next.js proxy on private routes. Domain models are Zod-validated; generated DB types await an actual deployed schema.

The process cache is bounded; failed sources may use previously cached source-specific evidence with stale labels. Supabase snapshots permit reuse across process restarts. Partial data is never replaced by fixtures. Without a database, real report durability across restarts/serverless workers is not supported.

Scheduled ingestion refreshes one oldest known building per invocation, upserts source/external IDs, creates score snapshots, and records run metadata. This is targeted rolling re-querying, not a complete citywide ingestion service or a resumable full backfill. Query caps are visible. Record grouping tables exist but grouping is currently computed in scoring, not persisted. A record’s single building FK is insufficient for multiple buildings sharing tax-lot/nearby evidence; future many-to-many links are needed before citywide aggregation.

AI only describes public evidence. JSON output is validated, unknown/cross-building citations are rejected, and rankings remain deterministic. Authenticated consent plus an atomic daily quota is required for paid calls. Requests are bounded to 40 records/building, 1600 output tokens, no automatic retries, and 20 seconds. Cache-by-snapshot and global concurrency/cost budgets are not implemented.

Private PDF extraction runs in Node using pdfjs-dist. The application stores the PDF and exact finding excerpts, not full extracted-page text. Background queues, sandboxed extraction workers, persistent upload quotas, malware scanning and direct storage initiation remain production-hardening work.
