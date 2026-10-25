import { globSync, readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";

// A "use client" module only becomes a client boundary in a consumer's
// bundle if the directive is still the first statement of the shipped file.
// The pipes import the visit boundaries, so the reverse matters as much: a
// directive anywhere else would turn a server entry point into client code.

const clientModules = ["src/client-hooks.ts", "src/visit-boundary.tsx"];

const isClientModule = (file: string) => /^["']use client["'];/.test(readFileSync(file, "utf8"));

test("exactly the client hooks and the visit boundaries are client modules", () => {
  const sources = globSync("src/**/*.{ts,tsx}").filter((file) => !/\.test\.tsx?$/.test(file));
  expect(sources.filter(isClientModule).sort()).toEqual(clientModules);
});

test.each(clientModules)("%s compiles with the directive first", (file) => {
  const { outputText } = ts.transpileModule(readFileSync(file, "utf8"), {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  expect(outputText.startsWith('"use client";')).toBe(true);
});
