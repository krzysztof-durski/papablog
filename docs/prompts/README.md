# AI Prompt Log

This project is built with heavy AI assistance (Claude Code). In the interest
of transparency about how the codebase actually came together, this
directory keeps a running log of that work: one dated file per significant
session, each containing the key prompts given and a summary of what was
built or decided as a result.

**Convention:** `YYYY-MM-DD-short-slug.md`, containing:

- **Model** — which Claude model did the work
- **Prompts** — the significant prompts/requests from that session (not
  padded with every minor "continue" or follow-up acknowledgement)
- **Summary** — what was actually built, key decisions made, and any bugs
  found and fixed along the way
- **Commits** — the resulting commit hash(es), once committed

This log is retroactive for early sessions (see the note on each 2026-09-27
entry) — the convention wasn't actually wired up until partway through, at
which point it was backfilled from the conversation history.
