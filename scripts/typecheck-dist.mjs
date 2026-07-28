#!/usr/bin/env node
/**
 * Typechecks the built `dist/**\/*.d.ts` from a consumer's point of view.
 *
 * Every other step of the gate reads `src`, where types are computed
 * structurally and declaration emit never runs. This one reads the shipped
 * artifact back: the fixture in `tests/dist-consumer` imports the package
 * through its real `exports` subpaths and is checked with
 * `skipLibCheck: false`, the setting that otherwise degrades a broken
 * declaration to `any` instead of erroring.
 *
 * `skipLibCheck: false` also checks `next`'s and `react-dom`'s own shipped
 * declarations, which are not clean and are not ours to fix. Errors inside
 * `node_modules` are therefore reported as a count and never fail the run;
 * only errors in `dist` and in the fixture do.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "tests", "dist-consumer");
const verbose = process.argv.includes("--verbose");

/**
 * Links the repo into the fixture's own `node_modules` so that TypeScript
 * resolves `@flefebvre/next-pipe/*` through the real `exports` map in
 * `package.json` — the same path a published consumer takes — rather than
 * through a `paths` alias that would duplicate that map and drift from it.
 */
function linkPackageIntoFixture() {
  const scopeDir = path.join(fixtureDir, "node_modules", "@flefebvre");
  const linkPath = path.join(scopeDir, "next-pipe");
  fs.mkdirSync(scopeDir, { recursive: true });
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(path.join("..", "..", "..", ".."), linkPath, "dir");
}

const ERROR_LINE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const TYPE_ALIAS = /^\s*(?:export\s+)?type\s+(\w+)/;

/** Groups tsc's flat output into one entry per error, continuation lines included. */
function parseDiagnostics(output) {
  const diagnostics = [];
  for (const line of output.split("\n")) {
    const match = ERROR_LINE.exec(line);
    if (match) {
      diagnostics.push({ file: match[1], line: Number(match[2]), code: match[4], lines: [line] });
    } else if (line.trim() !== "" && diagnostics.length > 0) {
      diagnostics.at(-1).lines.push(line);
    }
  }
  return diagnostics;
}

/**
 * A failed shape assertion reads as `Type 'false' does not satisfy the
 * constraint 'true'`, which names nothing. The assertion's own name is on the
 * `type X = Expect<…>` line at or just above the error, so quote it.
 */
function namedAssertion(diagnostic) {
  const file = path.join(repoRoot, diagnostic.file);
  if (!fs.existsSync(file)) return null;
  const source = fs.readFileSync(file, "utf8").split("\n");
  for (let i = diagnostic.line - 1; i >= 0 && i > diagnostic.line - 12; i--) {
    const match = TYPE_ALIAS.exec(source[i] ?? "");
    if (match) return match[1];
  }
  return null;
}

if (!fs.existsSync(path.join(repoRoot, "dist"))) {
  console.error("dist/ is missing — run `pnpm run build` first.");
  process.exit(1);
}

linkPackageIntoFixture();

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");
const result = spawnSync(
  process.execPath,
  [tsc, "--noEmit", "--pretty", "false", "-p", path.join(fixtureDir, "tsconfig.json")],
  { cwd: repoRoot, encoding: "utf8" },
);

const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const diagnostics = parseDiagnostics(output);
const ours = diagnostics.filter((d) => !d.file.includes("node_modules"));
const noise = diagnostics.length - ours.length;

if (diagnostics.length === 0 && result.status !== 0) {
  console.error(output || `tsc exited with status ${result.status}`);
  process.exit(1);
}

for (const diagnostic of ours) {
  console.error(diagnostic.lines.join("\n"));
  const assertion = diagnostic.code === "TS2344" ? namedAssertion(diagnostic) : null;
  if (assertion) console.error(`  failed assertion: ${assertion}`);
}

if (noise > 0) {
  const suffix = verbose ? "" : " (re-run with --verbose to print them)";
  console.error(
    `\n${noise} error(s) inside node_modules — third-party declarations surfaced by skipLibCheck: false, not failures of this check${suffix}`,
  );
  if (verbose) {
    for (const diagnostic of diagnostics.filter((d) => d.file.includes("node_modules")))
      console.error(diagnostic.lines.join("\n"));
  }
}

if (ours.length > 0) {
  console.error(
    `\nTYPECHECK:DIST FAILED — ${ours.length} error(s) in the built declarations or in the consumer fixture.`,
  );
  process.exit(1);
}

console.log("TYPECHECK:DIST OK");
