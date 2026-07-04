import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { analyzeModule, buildProgram, parseTsconfig, VERBS } from "./analyze-routes.js";

const ROOT = join(import.meta.dirname, "..", "..");
const fixture = (p: string) => join(ROOT, "tests", "fixtures", p).replace(/\\/g, "/");

// One program over the fixture routes; resolution pulls in the library source so
// the pipe-chain types are real. Built once and shared across the assertions below.
const FIXTURES = [
  fixture("reexport/route.ts"),
  fixture("delegated/route.ts"),
  fixture("plain/route.ts"),
  fixture("catch-all/[...slug]/route.ts"),
];
const parsed = parseTsconfig(join(ROOT, "tsconfig.json"));
const program = buildProgram(FIXTURES, parsed.options);
const checker = program.getTypeChecker();

function analyze(relPath: string) {
  const sourceFile = program.getSourceFile(fixture(relPath));
  if (!sourceFile) throw new Error(`source file not in program: ${relPath}`);
  return analyzeModule(checker, sourceFile);
}

test("parseTsconfig throws on a malformed tsconfig", () => {
  const dir = mkdtempSync(join(tmpdir(), "next-pipe-"));
  const bad = join(dir, "tsconfig.json");
  writeFileSync(bad, "{ this is not valid json");

  expect(() => parseTsconfig(bad)).toThrow();
});

test("HEAD and OPTIONS are part of the recognized verb set", () => {
  expect(VERBS).toContain("HEAD");
  expect(VERBS).toContain("OPTIONS");
});

test("re-exported verb is followed across files and judged usable", () => {
  expect(analyze("reexport/route.ts")).toEqual([{ name: "GET", usable: true }]);
});

test("a function-declaration verb that delegates to a pipe is usable", () => {
  expect(analyze("delegated/route.ts")).toEqual([{ name: "GET", usable: true }]);
});

test("plain handler verbs are detected but unusable (no output type)", () => {
  expect(analyze("plain/route.ts")).toEqual([
    { name: "GET", usable: false },
    { name: "OPTIONS", usable: false },
  ]);
});

test("idiomatic `export const` route still resolves as usable", () => {
  expect(analyze("catch-all/[...slug]/route.ts")).toEqual([{ name: "GET", usable: true }]);
});
