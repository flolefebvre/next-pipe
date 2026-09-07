import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Every test lives under `src/` (the build and the linter are scoped the
    // same way). Scanning only there also keeps agent worktrees under
    // `.claude/worktrees/`, which are full checkouts of this repo, from being
    // collected as this repo's tests.
    dir: "src",
  },
});
