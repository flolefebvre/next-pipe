import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Agent worktrees under `.claude/worktrees/` are full checkouts of this
    // repo: without this, their `src/**/*.test.ts` are collected alongside the
    // real ones and a run reports another branch's failures as this one's.
    exclude: [...configDefaults.exclude, ".claude/**"],
  },
});
