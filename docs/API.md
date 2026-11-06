> **Current override: AI is hard-disabled at the owner’s request.** OpenAI call code and SDK have been removed. API keys, environment flags and request consent cannot enable AI. The advisor is deterministic only; older descriptions of optional AI below describe the previous implementation, not current behavior. Re-enabling requires an explicitly authorized code change. Hosting/database/map charges are separate from AI and are not controlled by this lock.

# API

JSON success values are plain objects. Errors use `{ "error": { "code": "SOURCE_ERROR", "message": "…" } }`. Status codes: invalid input 400, auth 401, forbidden 403, missing resource 404, unsupported PDF 422, quota 429, unavailable configured service 503, upstream/general service failure 502. Responses use `Cache-Control: no-store`; public upstream data has a bounded internal TTL.

| Method / path | Contract |
|---|---|
| GET /api/address/autocomplete?q= | 3–120 characters; `{candidates: Identity[]}` max 8 |
| GET /api/address/resolve?q= | Exact candidate label re-resolved via GeoSearch; stores canonical identity |
| GET /api/buildings/:id | Report with identity, records, coverage, scores, checkedAt, demo |
| GET /api/buildings/:id/records | category optional, numeric cursor and limit 1–100; `{records,nextCursor}` |
| GET /api/buildings/:id/trends?window=12 | Window 3/12/36; month counts plus coverage and caveat |
| POST /api/compare | `{ids:[2–3 unique IDs],weights:{pests,bedbugs,heat,maintenance,noise}}`; scores only shared eligible categories |
| POST /api/advisor | Same plus `consent`; deterministic by default, authenticated quota for enabled AI |
| GET /api/saved | Authenticated own buildings and comparisons |
| POST /api/saved | `{kind:'building'|'comparison',ids,name?}`; real IDs only |
| DELETE /api/saved | `{kind,id}` removes own saved row |
| POST /api/auth | `{email}` sends PKCE email link |
| DELETE /api/auth | Signs out |
| GET /api/account | Verified identity and saved preferences |
| PATCH /api/account | Five 0–5 category weights |
| DELETE /api/account | `{confirm:'DELETE'}`; deletes owned storage/documents before auth user |
| GET /api/leases | Own private document metadata |
| POST /api/leases | Multipart `file` PDF + `consent=true`; validates/extracts then privately stores; `{id,status,pageCount}` |
| GET /api/leases/:uuid | Own status and results only |
| POST /api/leases/:uuid/analyze | Explicit deterministic analysis; no external AI |
| DELETE /api/leases/:uuid | Owner-checked storage + metadata deletion |
| GET/POST /api/internal/ingest | Exact Bearer CRON_SECRET; one known building per bounded run |
| GET /api/internal/cleanup | Exact Bearer CRON_SECRET; max 50 expired PDFs/run |

Example comparison:

```json
{"ids":["demo-1","demo-2"],"weights":{"pests":5,"bedbugs":5,"heat":3,"maintenance":3,"noise":1}}
```

Example source outage coverage:

```json
{"source":"HPD violations","status":"error","count":0,"checkedAt":"2026-10-29T00:00:00Z","message":"Official source unavailable. No substitute data shown."}
```

`checkedAt` means retrieval time, not the date of an inspection. Public source URLs are configured constants; clients cannot choose upstream hosts. POST/DELETE/PATCH requests validate Origin when present. Paid quotas are database-atomic; generic throttling is process-local and must be supplemented with deployment controls.
