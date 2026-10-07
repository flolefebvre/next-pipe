#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runGenCli } from "../codegen/generate.js";
import { runAgentsMd } from "./agents-md.js";

/** The subcommands `runCli` dispatches to; injectable so tests can observe dispatch. */
type Commands = {
  gen: (argv: string[]) => void;
  agentsMd: (argv: string[]) => number;
};

const defaultCommands: Commands = { gen: runGenCli, agentsMd: runAgentsMd };

const HELP = `next-pipe — typed, onion-model middlewares for the Next.js App Router.

Usage:
  next-pipe <command> [options]

Commands:
  gen         Generate typed client route builders from your app/ directory.
  agents-md   Add or refresh the next-pipe block in ./AGENTS.md so AI coding agents read the bundled docs.

Run \`next-pipe <command> --help\` for that command's options.
`;

/** Dispatches `argv` (without the node/script prefix) to a subcommand. Returns the exit code. */
export function runCli(argv: string[], commands: Commands = defaultCommands): number {
  const [command] = argv;
  if (command === undefined || command === "-h" || command === "--help") {
    console.log(HELP);
    return 0;
  }
  if (command === "gen") {
    commands.gen(argv.slice(1));
    return 0;
  }
  if (command === "agents-md") return commands.agentsMd(argv.slice(1));
  // Flags with no subcommand: the pre-1.1 form of `gen`, kept working.
  if (command.startsWith("-")) {
    commands.gen(argv);
    return 0;
  }
  console.error(`✗ unknown command "${command}"`);
  console.error(`\nRun \`next-pipe --help\` for usage.`);
  return 1;
}

// Only run when invoked as the CLI entry, not when imported (e.g. by tests).
// Resolve symlinks before comparing: under pnpm/`pnpm link` the package dir is a
// symlink, so `process.argv[1]` (as invoked) and `import.meta.url` (realpath) differ.
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isCliEntry()) process.exitCode = runCli(process.argv.slice(2));
