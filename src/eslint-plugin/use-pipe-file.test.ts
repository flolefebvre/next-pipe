import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RuleTester, type Linter, type Rule } from "eslint";
import tseslint from "typescript-eslint";
import { test } from "vitest";
import { usePipeFile } from "./use-pipe-file.js";

/**
 * The rule reads the filesystem — the `pipe.ts` above the linted file, the
 * modules its exports are re-exported from — so the cases point at real files
 * under `tests/fixtures/eslint/`, which carries its own `tsconfig.json` (with a
 * `@/*` alias) for module resolution. Messages name the governing file relative
 * to the linter's cwd, which under vitest is the repo root.
 */
const ROOT = join(import.meta.dirname, "..", "..");
const FIXTURES = "tests/fixtures/eslint";

const file = (path: string) => join(ROOT, FIXTURES, path);
const source = (path: string) => readFileSync(file(path), "utf8");

const valid = (path: string) => ({ code: source(path), filename: file(path) });
const invalid = (path: string, ...messages: string[]) => ({
  code: source(path),
  filename: file(path),
  errors: messages.map((message) => ({ message })),
});

/** `<subject> must be built from <name> exported by <pipe.ts>.` */
const from = (subject: string, expected: string, pipeFile: string) =>
  `${subject} must be built from ${expected} exported by ${FIXTURES}/${pipeFile}.`;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser as unknown as Linter.Parser,
    ecmaVersion: 2022,
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

test("use-pipe-file", () => {
  ruleTester.run("use-pipe-file", usePipeFile as unknown as Rule.RuleModule, {
    valid: [
      // A page built from the `pipe.ts` next to it.
      valid("src/app/page.tsx"),
      // …and a layout, through one extra `.use()`.
      valid("src/app/layout.tsx"),
      // The chain may pass through a same-file intermediate binding.
      valid("src/app/intermediate/page.tsx"),
      // The governing pipe reached through the project's `@/*` alias.
      valid("src/app/alias/page.tsx"),
      // `export default Page` where `Page` is imported: followed, not skipped.
      valid("src/app/imported-default/page.tsx"),
      // Governed by the closest `pipe.ts`, which is the one it imports.
      valid("src/app/admin/page.tsx"),
      // A `pipe.ts` correctly rooted in its parent's.
      valid("src/app/admin/pipe.ts"),
      valid("src/app/admin/users/pipe.ts"),
      // No `pipe.ts` above: the file may do whatever it likes.
      valid("src/standalone/page.tsx"),
      // Same for a `pipe.ts` with no ancestor exporting its kind — a custom
      // pipe built from the `/server` primitives is fine.
      valid("src/standalone/custom/pipe.ts"),
      // `export { GET } from "./handlers"` where the target uses the pipe.
      valid("src/app/api/reexport-ok/route.ts"),
      // Both action kinds, each from the governing pipe.
      valid("src/app/actions/good.ts"),
      // A function-level `"use server"` is out of scope.
      valid("src/app/actions/nested-directive.ts"),
      // `route.ts` was always checked; nothing changes for the valid case.
      valid("src/app/no-jsx-route/route.ts"),
    ],
    invalid: [
      // Rooted in the library constructor instead of the governing pipe.
      invalid("src/app/lib-root/page.tsx", from("page.tsx", "pagePipe", "src/app/pipe.ts")),
      // A bare page function.
      invalid("src/app/bare/page.tsx", from("page.tsx", "pagePipe", "src/app/pipe.ts")),
      // `page.ts` is a page too — the extension is not an escape hatch.
      invalid("src/app/no-jsx/page.ts", from("page.ts", "pagePipe", "src/app/pipe.ts")),
      // Templates are governed exactly like pages and layouts.
      invalid(
        "src/app/bare-template/template.tsx",
        from("template.tsx", "templatePipe", "src/app/pipe.ts"),
      ),
      // Skips a layer: `admin/users/pipe.ts` is the closest, not `app/pipe.ts`.
      invalid(
        "src/app/admin/users/page.tsx",
        from("page.tsx", "pagePipe", "src/app/admin/users/pipe.ts"),
      ),
      // A `pipe.ts` that ignores the one above it.
      invalid("src/app/libpipe/pipe.ts", from("pagePipe", "pagePipe", "src/app/pipe.ts")),
      // A `pipe.ts` may only export the six names.
      invalid(
        "src/app/badpipe/pipe.ts",
        "pipe.ts may only export pagePipe, layoutPipe, templatePipe, routePipe, actionPipe or formActionPipe; 'helper' is not one of them.",
        "pipe.ts may only export pagePipe, layoutPipe, templatePipe, routePipe, actionPipe or formActionPipe; a default export is not one of them.",
      ),
      // Verbs are checked one by one: GET is fine, POST bypasses the pipe.
      invalid("src/app/api/route.ts", from("POST", "routePipe", "src/app/pipe.ts")),
      // The re-export is followed into a target that bypasses the pipe — in
      // both of its syntaxes.
      invalid("src/app/api/reexport/route.ts", from("GET", "routePipe", "src/app/pipe.ts")),
      invalid("src/app/api/reexport-local/route.ts", from("GET", "routePipe", "src/app/pipe.ts")),
      // `"use server"` anywhere in the directive prologue marks the module.
      invalid(
        "src/app/actions/prologue.ts",
        from("archiveNote", "actionPipe or formActionPipe", "src/app/pipe.ts"),
      ),
      // A bare `"use server"` export names every governed action kind; one
      // rooted in the library constructor names only its own kind.
      invalid(
        "src/app/actions/bad.ts",
        from("deleteNote", "actionPipe or formActionPipe", "src/app/pipe.ts"),
        from("createNote", "actionPipe", "src/app/pipe.ts"),
      ),
    ],
  });
});
