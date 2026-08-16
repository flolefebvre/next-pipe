import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test, vi } from "vitest";
import { VERBS } from "./analyze-routes.js";
import { generate } from "./generate.js";

const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURE = join(ROOT, "tests", "fixtures", "verbs");

// One generation run over `tests/fixtures/verbs/app`, which holds one
// pipe-backed route per verb (`app/get`, …, `app/delete`). Each verb therefore
// gets its own generated module, so a syntax error in one cannot mask another.
const OUT_DIR = mkdtempSync(join(tmpdir(), "next-pipe-gen-"));

vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});
generate({
  cwd: ROOT,
  appDir: join(FIXTURE, "app"),
  outDir: OUT_DIR,
  clientImport: "@flefebvre/next-pipe/client",
  routeImportBase: "@/app",
  tsconfig: join(FIXTURE, "tsconfig.json"),
});
vi.restoreAllMocks();

const read = (file: string) => readFileSync(join(OUT_DIR, file), "utf8");

/** Syntax diagnostics only — types are checked by `typecheck`, not here. */
function syntaxErrors(source: string, fileName: string): string[] {
  const { diagnostics = [] } = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  });
  return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

/** True when `name` can actually be bound — i.e. is not a reserved word. */
function isBindable(name: string): boolean {
  return syntaxErrors(`const ${name} = 0;`, "binding.ts").length === 0;
}

const VALID_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

describe.each(VERBS)("generated module for %s", (verb) => {
  // The module's *file* name mirrors the route dir (`app/get` → `get.ts`); the
  // export inside it is the verbatim verb.
  const file = `${verb.toLowerCase()}.ts`;
  const source = read(file);

  // The regression guard: `export const delete = …` is a syntax error.
  test("parses as TypeScript with no syntax errors", () => {
    expect(syntaxErrors(source, file)).toEqual([]);
  });

  test("the builder is exported under a name that is a usable binding", () => {
    const name = source.match(/^export const (\S+) = defineRoute/m)?.[1];
    expect(name).toBeDefined();
    expect(name).toMatch(VALID_IDENTIFIER);
    expect(isBindable(name!)).toBe(true);
  });

  test("the emitted method literal is the uppercase verb", () => {
    const method = source.match(/defineRoute<[^>]*>\(.*, "([^"]+)"\);/)?.[1];
    expect(method).toBe(verb);
  });

  test("the emitted method literal reaches the server as the verb", () => {
    const method = source.match(/defineRoute<[^>]*>\(.*, "([^"]+)"\);/)?.[1];
    // `fetch` normalizes only some lowercase methods; `patch` would be sent
    // as-is and Next would answer 405.
    expect(new Request("http://x/", { method }).method).toBe(verb);
  });
});

test("the generated barrel parses as TypeScript with no syntax errors", () => {
  expect(syntaxErrors(read("index.ts"), "index.ts")).toEqual([]);
});

test("one module per verb route is generated and imported by the barrel", () => {
  expect(read("index.ts").match(/^import \* as _r\d+ from/gm)).toHaveLength(VERBS.length);
});
