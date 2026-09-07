/**
 * Which `pipe.ts` governs a file, for a given kind.
 *
 * The walk goes up one directory at a time, from the starting directory to (and
 * including) the linter's working directory, and stops at the *first* `pipe.ts`
 * that exports the kind. "First" is the whole point: a page under
 * `admin/users/` whose `admin/users/pipe.ts` exports `pagePipe` must be built
 * from that one — reaching past it to `admin/pipe.ts` skips a layer of
 * middlewares and is exactly what the rule catches.
 *
 * Nothing above the file exporting the kind means nothing governs it, and the
 * file is left alone.
 */

import { dirname } from "node:path";
import { PIPE_FILE, type PipeName } from "./kinds.js";
import { moduleExports } from "./module-exports.js";
import { fileExists, normalizePath, sourceOf, type Analyzer } from "./ts-project.js";

export function findGoverningPipe(
  analyzer: Analyzer,
  startDir: string,
  name: PipeName,
  cwd: string,
): string | undefined {
  const root = normalizePath(cwd);
  let dir = normalizePath(startDir);

  for (;;) {
    if (dir !== root && !dir.startsWith(`${root}/`)) return undefined;

    const candidate = `${dir}/${PIPE_FILE}`;
    if (fileExists(candidate)) {
      const sourceFile = sourceOf(analyzer, candidate);
      if (sourceFile && moduleExports(sourceFile).has(name)) return candidate;
    }

    if (dir === root) return undefined;
    const parent = normalizePath(dirname(dir));
    if (parent === dir) return undefined;
    dir = parent;
  }
}
