# Gemini building advice

The main app was copied from the locally available `origin/main` snapshot (033e511) into `ai-integration` without merging, staging, committing, or pushing. `prototype/` is retained separately.

## Data and behavior

The building page `/building/[id]` renders `ReportView`, which adds `BuildingAdvice` for live reports. POST `/api/ai/advice` accepts `{buildingId, question}` and calls the existing server-side `getReport()`. That function uses Supabase `buildings.identity` / `buildings.report`, in-memory caching, and official NYC adapters; no schema changes or client-provided report facts are used.

The Gemini context includes identity, record counts, source coverage, and up to 100 most recent evidence records. It explicitly reports omitted records. Counts are not all complaint counts: each evidence record retains its kind and geographic scope. No rent or neighborhood is inferred. Synthetic demo reports are rejected.

The prototype's Hearthstone Hub instructions, model (`gemini-3.5-flash-lite`), two attempts, and 429/503 retry behavior are reused. Each provider request has a 20-second timeout. Missing credentials, empty output, or exhausted/failed attempts produce a labeled deterministic summary from the report. This summary does not purport to answer the user's question. Existing `/api/advisor` comparison behavior and its billing lock remain unchanged.

`GEMINI_API_KEY` is read only in a `server-only` module. No provider errors or credentials are returned to the client. The route reuses existing origin protection, rate limiting and no-store responses. It is public like the building report; account and saved-building authorization are unchanged.

## Files specific to this integration

- `src/app/api/ai/advice/route.ts`: request validation and report lookup.
- `src/lib/building-advice.ts`: Gemini invocation, context and fallback.
- `src/components/BuildingAdvice.tsx`: accessible question form, loading/error states and Markdown rendering.
- `src/components/ReportView.tsx`: add panel to live building reports.
- `src/app/globals.css`: scoped advice styling.
- `package.json` / `package-lock.json`: Gemini and Markdown dependencies.
- `tsconfig.json` / `eslint.config.mjs`: exclude independent `prototype/` and `aptsignal-auth/` projects from root checks.
- `.env.example`: configuration placeholders, no secrets.
- `tests/unit/building-advice.test.ts`: isolated report and provider mocks.

## Manual testing

1. Run `npm install` in the repository root. Copy `.env.example` to `.env.local` and configure the existing Supabase settings. Add `GEMINI_API_KEY` only to the root `.env.local` (or server deployment environment); the prototype's environment file is not loaded by the root app.
2. Run `npm run dev` from the root. Stop the prototype server first if it occupies port 3000, or use `npm run dev -- --port 3100`.
3. Search for a real NYC address, open its building report, and use **Ask AI about this building**. Confirm headings, bold labels and lists render correctly and specific claims correspond to report evidence. Reports may have incomplete coverage; that must not be interpreted as absence of problems.
4. Remove `GEMINI_API_KEY` and restart. Ask again and confirm the labeled records summary appears. Provider failure also takes this path.
5. Open `/building/demo-1`: the AI form must be absent. Direct API requests for demo IDs must return 400; unknown IDs return 404; blank questions return 400.
6. Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

A successful build and mocked tests do not establish that a deployment's Gemini credentials/model access, Supabase credentials, or upstream NYC services are available. No live Gemini request is needed for the automated tests.

## Response style

Gemini is instructed to answer the actual question in its first one or two sentences, then provide only relevant evidence in plain language. Most answers target 150–250 words, with shorter answers for simple questions and room for complex ones. Ordinary answers avoid headings, IDs, repetitive disclaimers and record inventories. Technical identifiers remain available when specifically requested. Dates and plain-language sources help renters verify claims in the report. Accuracy, evidence scope and relevant coverage caveats take precedence over brevity. These are model instructions, not a hard word cutoff; no generated response is truncated.

The non-AI fallback is also shorter: it omits zero-count categories and the technical source-status inventory, explains coverage limits once, and directs the renter to the existing report for details.
