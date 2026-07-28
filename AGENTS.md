# Agent skill sync

When changing the public API or `docs/`, update `skills/next-pipe/` (and the version stamp in its `SKILL.md`) in the same PR.

# Commands

For formatting, run `pnpm run format`.
For validations, run `pnpm run typecheck`, `pnpm run lint`, `pnpm run test` or `pnpm run build`.
For the full gate, run `pnpm run gate`.

## `pnpm run typecheck:dist`

Builds, then typechecks the shipped `dist/**/*.d.ts` from a consumer's point of
view: the fixture in `tests/dist-consumer/` imports the package through its real
`exports` subpaths and asserts the _resolved shape_ of the public types, so an
`any` where a concrete type belongs fails. Runs in `pnpm run gate`, in place of
`pnpm run build` — it builds first.

Three things keep it from silently detecting nothing:

- `skipLibCheck: false` in the fixture — `true` degrades broken declarations to
  `any` instead of erroring. The script refuses to run if it is set back.
- The fixture resolves `@flefebvre/next-pipe` to `dist`, never `src`, where
  declaration emit never runs.
- Both resolution modes run (`tsconfig.json` nodenext, `tsconfig.bundler.json`
  what `create-next-app` generates); each catches errors the other misses (#7).

Errors in `next`/`react-dom`'s own declarations are counted, never fatal;
`--verbose` prints them.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `flolefebvre/next-pipe`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Labels

The five canonical triage roles plus the `prd` type label, each using its default string. See `docs/agents/labels.md`.

### Domain docs

A single `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.
