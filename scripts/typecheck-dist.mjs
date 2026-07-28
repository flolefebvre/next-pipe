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
 * declarations, which are not clean and are not ours to fix. Only errors in
 * `dist` and in the fixture fail the run; everything else is reported as a
 * count.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = path.join(repoRoot, "tests", "dist-consumer");
const verbose = process.argv.includes("--verbose");
const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

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

/** tsc reports paths relative to the repo root; normalize the odd absolute one. */
function relativeTo(file) {
  return path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join("/");
}

const isFixture = (file) => relativeTo(file).startsWith("tests/");
const isOurs = (file) => {
  const relative = relativeTo(file);
  // No `node_modules` exclusion, deliberately: the fixture reaches `dist`
  // *through* a symlink under its own `node_modules`, so excluding that path
  // would silently reclassify every real failure as third-party noise the day
  // tsc stops realpathing it. Hence the unrealpathed form is matched too,
  // scoped to this package — plenty of others ship a `dist/`.
  return relative.startsWith("dist/") || relative.includes(`${pkg.name}/dist/`) || isFixture(file);
};

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

/**
 * Fails loudly if the fixture has been configured into detecting nothing.
 * `skipLibCheck: true` makes the whole check vacuous while still exiting 0,
 * which is the one failure mode indistinguishable from success.
 */
function assertFixtureStillChecks(tsconfigFile) {
  const source = fs.readFileSync(tsconfigFile, "utf8");
  if (/"skipLibCheck"\s*:\s*true/.test(source)) {
    console.error(
      `${path.relative(repoRoot, tsconfigFile)} sets skipLibCheck: true — that suppresses every error inside .d.ts files, which is exactly what this check exists to surface.`,
    );
    process.exit(1);
  }
}

/**
 * The positive half of the same guard: assert the program read `dist` and did
 * not read `src`.
 *
 * `skipLibCheck` is not the only way to make this vacuous — a `paths` alias to
 * `src`, or a fixture file dropped from `include`, leaves the run reporting
 * `OK` while checking types that were never emitted. Both halves are needed:
 * "read some dist" alone is defeated by aliasing only the subpath whose
 * declarations are broken, which still reads dist for everything else.
 */
function assertReadsDistNotSrc(mode) {
  const result = spawnSync(
    process.execPath,
    [tsc, "--listFilesOnly", "--pretty", "false", "-p", mode.tsconfig],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const read = (result.stdout ?? "").split("\n").filter(Boolean).map(relativeTo);
  const fromSrc = read.filter((file) => file.startsWith("src/"));

  if (fromSrc.length > 0) {
    console.error(
      `${mode.name}: the program read ${fromSrc.length} file(s) under src/ (${fromSrc[0]}) — the fixture must resolve @flefebvre/next-pipe to dist, where declaration emit has actually run. Checking src makes this a duplicate of \`pnpm typecheck\`.`,
    );
    process.exit(1);
  }
  if (!read.some(isOurs)) {
    console.error(
      `${mode.name}: the program read no file under dist/ — nothing that ships was checked.`,
    );
    process.exit(1);
  }
}

if (!fs.existsSync(path.join(repoRoot, "dist"))) {
  console.error("dist/ is missing — run `pnpm run build` first.");
  process.exit(1);
}

linkPackageIntoFixture();

// Module resolution decides which of a dependency's declaration files is read,
// so it decides which broken emitted types resolve anyway. Both modes are run:
// `tsconfig.json` is Node ESM, `tsconfig.bundler.json` is what a Next.js app
// uses, and each catches errors the other misses.
const modes = [
  { name: "node (module: nodenext)", tsconfig: path.join(fixtureDir, "tsconfig.json") },
  {
    name: "bundler (module: esnext — what create-next-app generates)",
    tsconfig: path.join(fixtureDir, "tsconfig.bundler.json"),
  },
];

const require = createRequire(import.meta.url);
const tsc = require.resolve("typescript/bin/tsc");

let failed = 0;
let noise = 0;

// Every mode: `tsconfig.bundler.json` extends the Node one and could override
// `skipLibCheck` back to `true`.
for (const mode of modes) {
  assertFixtureStillChecks(mode.tsconfig);
  assertReadsDistNotSrc(mode);
}

for (const mode of modes) {
  const result = spawnSync(
    process.execPath,
    [tsc, "--noEmit", "--pretty", "false", "-p", mode.tsconfig],
    { cwd: repoRoot, encoding: "utf8" },
  );

  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const diagnostics = parseDiagnostics(output);

  if (diagnostics.length === 0 && result.status !== 0) {
    console.error(output || `tsc exited with status ${result.status}`);
    process.exit(1);
  }

  const ours = diagnostics.filter((d) => isOurs(d.file));
  noise += diagnostics.length - ours.length;
  failed += ours.length;

  console.error(`\n── ${mode.name} ─────────────`);
  if (ours.length === 0) console.error("no errors in the built declarations or the fixture");

  for (const diagnostic of ours) {
    console.error(diagnostic.lines.join("\n"));
    const assertion = isFixture(diagnostic.file) ? namedAssertion(diagnostic) : null;
    if (assertion) console.error(`  failed assertion: ${assertion}`);
  }

  if (verbose) {
    for (const diagnostic of diagnostics.filter((d) => !isOurs(d.file)))
      console.error(diagnostic.lines.join("\n"));
  }
}

if (noise > 0) {
  const suffix = verbose ? "" : " (re-run with --verbose to print them)";
  console.error(
    `\n${noise} error(s) outside the package — third-party declarations surfaced by skipLibCheck: false, not failures of this check${suffix}`,
  );
}

if (failed > 0) {
  console.error(
    `\nTYPECHECK:DIST FAILED — ${failed} error(s) in the built declarations or in the consumer fixture.`,
  );
  process.exit(1);
}

console.log("\nTYPECHECK:DIST OK");
