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
`any` where a concrete type belongs fails the check.

It is deliberately **not** part of `pnpm run gate` yet: it fails today, on real
bugs in the emitted declarations (see issues #7, #8, #9). It joins the gate once
those land.

Two details make it work, and breaking either makes it silently detect nothing:

- The fixture sets `skipLibCheck: false`. `true` — the library's own setting and
  the Next.js default — suppresses errors inside `.d.ts` files and degrades the
  offending types to `any` instead of erroring.
- The fixture has its own tsconfig and is excluded from the root one. It must
  resolve `@flefebvre/next-pipe` to `dist`, never compile against `src`, where
  the types are computed structurally and declaration emit never runs.

`skipLibCheck: false` also surfaces errors inside `next` and `react-dom`'s own
declarations. Those are reported as a count and never fail the run; only errors
in `dist` and in the fixture do. Pass `--verbose` to print them.

## Agent skills

### Issue tracker

Issues and PRDs live as GitHub issues on `flolefebvre/next-pipe`, driven via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Labels

The five canonical triage roles plus the `prd` type label, each using its default string. See `docs/agents/labels.md`.

### Domain docs

A single `CONTEXT.md` at the repo root plus ADRs in `docs/adr/`. See `docs/agents/domain.md`.
