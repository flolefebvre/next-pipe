# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues on `flolefebvre/next-pipe`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Blocking relationships

Use GitHub's **native issue dependencies** — the canonical, UI-visible representation.

- **Add an edge**: `gh api --method POST repos/flolefebvre/next-pipe/issues/<blocked>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/flolefebvre/next-pipe/issues/<n> --jq .id`, _not_ the `#number` or `node_id`).
- **Read blockers**: GitHub reports `issue_dependencies_summary.blocked_by` on the issue — it counts **open** blockers only, so it is the live gate: an issue is unblocked when it reaches 0.
- **Fallback**: where dependencies aren't available, put a `Blocked by: #<n>, #<n>` line at the top of the blocked issue's body. The issue is unblocked when every listed blocker is closed.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
