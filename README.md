# gdg-apartments

- `spec.md` — product and technical specification
- `hearthstone-hub-execution-plan.md` — execution plan
- `data-pipeline/` — fetches and cleans NYC building records into Supabase. Run commands from that folder (Node 22, `nvm use`):
  - `npm test`
  - `node --env-file=.env scripts/ingest.js "161 Newel St" [--force]`
  - Plan and findings: `data-pipeline/data-pipeline-plan.md`; lot vs. building decision: `data-pipeline/decision-lot-vs-building.md`
