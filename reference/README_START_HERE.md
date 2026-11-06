# AptSignal Codex handoff

This bundle is a **ready-to-use implementation prompt**, not the application source code.

## Fastest method

1. Open an empty repository in Codex.
2. Put `CODEX_MASTER_PROMPT.md` and `homepage_visual_reference.png` in the repository, then paste the short `CODEX_KICKOFF.txt` into Codex. Alternatively, paste the entire master prompt directly into Codex.
3. Ask Codex to create the repository and execute the phases in order, testing every step.
4. Provision the Supabase and map tile credentials from the resulting `.env.example`; OpenAI API access is optional until AI features are enabled.
5. Review all legal statements, data-score methodology, upstream license/attribution and privacy controls before a public launch.

## Additional guidance

- The reference image is a design concept with **illustrative example values**, not factual NYC building data.
- The prompts instruct Codex to avoid fabricated grades and to show ungraded states when coverage is insufficient.
- The project is NYC-first. NJ requires separate official data and jurisdiction-specific logic.
- The prompt is deliberately extensive to prevent a pretty but nonfunctional prototype.
