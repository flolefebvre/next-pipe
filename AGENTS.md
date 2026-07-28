# Agent skill sync

When changing the public API or `docs/`, update `skills/next-pipe/` (and the version stamp in its `SKILL.md`) in the same PR.

# Commands

For formatting, run `pnpm run format`.
For validations, run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test` or `pnpm run build`.
For the full gate, run `pnpm run gate`.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `flolefebvre/next-pipe`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Labels

The five canonical triage roles plus the `prd` type label, each using its default string. See `docs/agents/labels.md`.

### Domain docs

A single `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.
