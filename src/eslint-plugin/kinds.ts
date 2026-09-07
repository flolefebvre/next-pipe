/**
 * The `pipe.ts` convention, as data.
 *
 * A `pipe.ts` may only export value bindings named after one of the six pipes,
 * and the name *is* the kind: `pagePipe` in `app/admin/pipe.ts` is the pipe
 * every page under `app/admin/` must be built from.
 */

/** The only value exports a `pipe.ts` may declare. Order drives the messages. */
export const PIPE_NAMES = [
  "pagePipe",
  "layoutPipe",
  "templatePipe",
  "routePipe",
  "actionPipe",
  "formActionPipe",
] as const;

export type PipeName = (typeof PIPE_NAMES)[number];

/** The kinds a `"use server"` file's exports are checked against. */
export const ACTION_PIPE_NAMES = ["actionPipe", "formActionPipe"] as const satisfies PipeName[];

/**
 * File *stems* whose default export is the handler, and the kind that governs
 * them. Both extensions count: Next.js accepts `page.ts` for a component that
 * builds no JSX, and the rule would be worth little if renaming a file were
 * enough to escape it.
 */
export const DEFAULT_EXPORT_STEMS = new Map<string, PipeName>([
  ["page", "pagePipe"],
  ["layout", "layoutPipe"],
  ["template", "templatePipe"],
]);

/**
 * A file named exactly this is a pipe file — in any directory. Exact, unlike
 * the entry points above: if both `pipe.ts` and `pipe.tsx` could govern, which
 * one wins when a directory holds both would be anybody's guess.
 */
export const PIPE_FILE = "pipe.ts";

/** The stem whose HTTP verb exports are checked. */
export const ROUTE_STEM = "route";

/** The `page` of `page.tsx`, or `undefined` when the file is not TypeScript. */
export function stemOf(basename: string): string | undefined {
  const match = /^(.+)\.tsx?$/.exec(basename);
  return match?.[1];
}

/**
 * The subpath the library's pipe constructors come from. Matched as a string
 * rather than resolved: a chain rooted in `pagePipe()` is wrong wherever the
 * package happens to live on disk, and consumers of this rule need not have
 * the package installed for the check to be right.
 */
export const PIPES_ENTRYPOINT = "@flefebvre/next-pipe/pipes";

export function isPipeName(name: string): name is PipeName {
  return (PIPE_NAMES as readonly string[]).includes(name);
}

export function isActionPipeName(name: string): name is (typeof ACTION_PIPE_NAMES)[number] {
  return (ACTION_PIPE_NAMES as readonly string[]).includes(name);
}
