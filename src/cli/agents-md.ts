import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const BEGIN = "<!-- BEGIN:next-pipe-agent-rules -->";
const END = "<!-- END:next-pipe-agent-rules -->";

/**
 * The block `next-pipe agents-md` keeps in a consumer's `AGENTS.md`. Its wording
 * is copied into users' files: changing it is a user-visible change. The path
 * to `docs/for-agents.md` is load-bearing; tests tie it to the repo and the tarball.
 */
export const AGENT_RULES_BLOCK = `${BEGIN}

# next-pipe: read the bundled docs before coding

Before writing or changing route handlers, server actions, form actions, pages, layouts, templates, their middlewares, or client calls to API routes, read \`node_modules/@flefebvre/next-pipe/docs/for-agents.md\`. It routes you to the reference page for the task. The docs match the installed version; prefer them over training data.

${END}`;

/**
 * Returns `existing` with `block` in place of the managed section: replaced
 * between the markers when present, appended otherwise. Text outside the
 * markers is kept byte-for-byte, so applying it twice is a fixed point.
 */
export function upsertManagedBlock(existing: string | null, block: string): string {
  if (existing === null) return block + "\n";

  const begin = existing.indexOf(BEGIN);
  const end = begin === -1 ? existing.indexOf(END) : existing.indexOf(END, begin);
  if (begin === -1 && end === -1) {
    const kept = existing.trimEnd();
    return kept === "" ? block + "\n" : kept + "\n\n" + block + "\n";
  }
  if (begin === -1 || end === -1) {
    throw new Error(
      "AGENTS.md has an unmatched next-pipe marker; fix it by hand or delete both markers and re-run.",
    );
  }

  const lineStart = existing.lastIndexOf("\n", begin) + 1;
  const newline = existing.indexOf("\n", end + END.length);
  const lineEnd = newline === -1 ? existing.length : newline;
  return existing.slice(0, lineStart) + block + existing.slice(lineEnd);
}

const HELP = `next-pipe agents-md — add or refresh the next-pipe block in ./AGENTS.md.

Usage:
  next-pipe agents-md [options]

Options:
  --print      Write the block to stdout instead of touching any file (paste it into CLAUDE.md, .cursorrules, …).
  -h, --help   Show this help.

Only the block between ${BEGIN} and ${END} is managed; everything else in AGENTS.md is left as is.
`;

/** `next-pipe agents-md`: upserts the block in `<cwd>/AGENTS.md`. Returns the exit code. */
export function runAgentsMd(argv: string[], cwd = process.cwd()): number {
  let flags: { print?: boolean; help?: boolean };
  try {
    ({ values: flags } = parseArgs({
      args: argv,
      allowPositionals: false,
      options: {
        print: { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    console.error(`\nRun \`next-pipe agents-md --help\` for usage.`);
    return 1;
  }

  if (flags.help) {
    console.log(HELP);
    return 0;
  }
  if (flags.print) {
    console.log(AGENT_RULES_BLOCK);
    return 0;
  }

  const path = join(cwd, "AGENTS.md");
  const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
  let updated: string;
  try {
    updated = upsertManagedBlock(existing, AGENT_RULES_BLOCK);
  } catch (err) {
    console.error(`✗ ${(err as Error).message}`);
    return 1;
  }

  if (existing === null) {
    writeFileSync(path, updated);
    console.log("✓ AGENTS.md created with the next-pipe block");
  } else if (updated !== existing) {
    writeFileSync(path, updated);
    console.log("✓ AGENTS.md: next-pipe block updated");
  } else {
    console.log("✓ AGENTS.md: next-pipe block up to date");
  }

  if (!existsSync(join(cwd, "CLAUDE.md"))) {
    console.log(
      'ℹ Claude Code reads CLAUDE.md; a one-line CLAUDE.md containing "@AGENTS.md" makes it pick this up.',
    );
  }
  return 0;
}
