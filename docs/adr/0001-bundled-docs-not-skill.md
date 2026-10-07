# Bundled docs and an AGENTS.md pointer, not an agent skill

**Status:** Accepted, 2026-10-07.

## Context

1.0.0 published only `dist`, so every README link was dead from `node_modules` (#25). The agent skill shipped in the repo's `skills/` directory duplicated ~3,800 words of `docs/`, needed a manual version stamp and a sync rule in `AGENTS.md`, and had to be installed per project through a third-party CLI. Vercel's evals for Next.js 16 scored bundled docs plus an `AGENTS.md` pointer at 100%, versus up to 79% for skills.

## Decision

Ship `docs/*.md` in the package. One agent-facing entry page, `docs/for-agents.md`, holds the routing and the rules. Consumers point agents at it with a marker-delimited block in `AGENTS.md` (`<!-- BEGIN:next-pipe-agent-rules -->` … `<!-- END:next-pipe-agent-rules -->`), written and refreshed by `next-pipe agents-md`, or pasted from the README. No skill, no postinstall hook. `docs/agents/` and `docs/adr/` are repo-internal and not shipped.

## Consequences

- The docs are version-matched by construction; no stamp.
- One corpus to maintain. The tables and rules in `for-agents.md` and the `rules` in `context7.json` are kept in sync by hand (rule in `AGENTS.md`).
- The path in the block is load-bearing: moving `for-agents.md` means changing `AGENT_RULES_BLOCK`, and a test ties the two.
- The block's wording is copied into consumers' files, so changing it is a user-visible change. Keep it stable.
